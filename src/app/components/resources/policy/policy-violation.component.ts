/** Displays policy evaluation metadata for a non-compliant resource. */
import { JsonPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  Input,
  OnChanges,
  SimpleChanges,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GovernanceService } from '@services/azure/governance.service';
import { PanelVariant, ResourceDetailItem } from '@services/azome/resource-detail.registry';
import { PolicySetDetailsDialogService } from './policy-set-details-dialog.service';
import { EMPTY, Subject, finalize, of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { PolicyDefinitionDetailComponent } from './policy-definition.component';

interface PolicyViolationProperties {
  resource?: string;
  resourceId?: string;
  policyDefinitionName?: string;
  policyDefinitionId?: string;
  policySetDefinitionName?: string;
  policySetDefinitionId?: string;
  complianceState?: string;
  complianceReasonCode?: string;
  policyDefinitionAction?: string;
  policyAssignmentName?: string;
  policyAssignmentId?: string;
  timestamp?: string;
  policyViolations?: PolicyViolationProperties[];
}

interface PolicyExistenceCondition {
  field?: string;
  equals?: unknown;
  in?: unknown[];
}

interface PolicyDefinitionDocument {
  properties?: {
    policyRule?: {
      then?: {
        details?: {
          type?: string;
          name?: string;
          existenceCondition?: PolicyExistenceCondition;
        };
      };
    };
  };
}

interface SecurityAssessmentResponse {
  properties?: {
    status?: {
      code?: string;
      statusChangeDate?: string;
    };
  };
}

interface PolicyViolationResource {
  id?: string;
  name?: string;
  properties?: PolicyViolationProperties;
}

/** Shows the affected resource and policy identifiers for a violation. */
@Component({
  selector: 'app-policy-violation-detail',
  standalone: true,
  imports: [JsonPipe, PolicyDefinitionDetailComponent],
  templateUrl: './policy-violation.component.html',
  styleUrl: './policy-violation.component.scss'
})
export class PolicyViolationDetailComponent implements ResourceDetailItem, OnChanges {
  static readonly preferredVariant: PanelVariant = 'wide';

  @Input() resource: PolicyViolationResource | null = null;

  private readonly destroyRef = inject(DestroyRef);
  private readonly governance = inject(GovernanceService);
  private readonly policySetDialog = inject(PolicySetDetailsDialogService);
  private readonly policyViolationChanges = new Subject<PolicyViolationProperties | null>();

  public readonly policyJson = signal<unknown | null>(null);
  public readonly policyJsonLoading = signal(false);
  public readonly policyJsonError = signal(false);
  public readonly assessmentLoading = signal(false);
  public readonly assessmentError = signal(false);
  public readonly assessmentErrorStatus = signal<number | null>(null);
  public readonly assessmentState = signal<{
    code: string;
    statusChangeDate?: string;
    conditionSatisfied: boolean | null;
    mismatch: boolean;
  } | null>(null);

  public readonly activeTab = signal<'details' | 'json'>('details');
  public readonly selectedViolationIndex = signal<number | null>(0);

  constructor() {
    this.policyViolationChanges.pipe(
      switchMap((violation) => {
        this.policyJson.set(null);
        this.policyJsonError.set(false);
        this.assessmentState.set(null);
        this.assessmentError.set(false);
        this.assessmentErrorStatus.set(null);

        if (!violation?.policyDefinitionId) {
          this.policyJsonLoading.set(false);
          this.assessmentLoading.set(false);
          return EMPTY;
        }

        this.policyJsonLoading.set(true);
        return this.governance.getPolicyJson(violation.policyDefinitionId).pipe(
          catchError(() => {
            this.policyJsonError.set(true);
            return of(null);
          }),
          tap((policy) => {
            this.policyJson.set(policy);
            this.policyJsonLoading.set(false);
          }),
          switchMap((policy) => this.loadAuditAssessment(violation, policy)),
          finalize(() => this.policyJsonLoading.set(false))
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();
  }

  /** Loads the selected policy definition when the detail panel resource changes. */
  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['resource']) {
      this.selectedViolationIndex.set(null);
      this.policyViolationChanges.next(null);
      this.activeTab.set('details');
    }
  }

  /** Switches between details and json tabs. */
  public selectTab(tab: 'details' | 'json'): void {
    this.activeTab.set(tab);
  }

  /** Opens the standalone Policy Set dialog using its definition ID. */
  public openPolicySetDetails(): void {
    this.policySetDialog.open(this.selectedViolation?.policySetDefinitionId);
  }

  public selectPolicyViolation(index: number): void {
    if (this.selectedViolationIndex() === index) {
      this.selectedViolationIndex.set(null);
      this.policyViolationChanges.next(null);
      return;
    }

    this.selectedViolationIndex.set(index);
    this.activeTab.set('details');
    this.policyViolationChanges.next(this.violations[index] ?? null);
  }

  /** Returns policy evaluation properties when the selected resource includes them. */
  public get properties(): PolicyViolationProperties | undefined {
    return this.resource?.properties;
  }

  public get violations(): PolicyViolationProperties[] {
    const violations = this.properties?.policyViolations;
    return violations?.length ? violations : this.properties ? [this.properties] : [];
  }

  public get selectedViolation(): PolicyViolationProperties | undefined {
    const index = this.selectedViolationIndex();
    return index === null ? undefined : this.violations[index];
  }

  private loadAuditAssessment(
    violation: PolicyViolationProperties,
    policy: unknown
  ) {
    if (violation.policyDefinitionAction?.toLowerCase() !== 'auditifnotexists'
      || !policy) {
      return EMPTY;
    }

    const details = (policy as PolicyDefinitionDocument).properties?.policyRule?.then?.details;
    if (details?.type?.toLowerCase() !== 'microsoft.security/assessments' || !details.name) {
      return EMPTY;
    }

    const resourceId = violation.resourceId ?? this.resource?.id;
    if (!resourceId) {
      return EMPTY;
    }

    this.assessmentLoading.set(true);
    return this.governance.getSecurityAssessment(resourceId, details.name).pipe(
      tap((assessment: SecurityAssessmentResponse) => {
        const code = assessment.properties?.status?.code;
        if (!code) {
          this.assessmentState.set(null);
          return;
        }

        const conditionSatisfied = this.assessmentMatchesCondition(
          code,
          details.existenceCondition
        );
        this.assessmentState.set({
          code,
          statusChangeDate: assessment.properties?.status?.statusChangeDate,
          conditionSatisfied,
          mismatch: violation.complianceState?.toLowerCase() === 'noncompliant'
            && conditionSatisfied === true
        });
      }),
      catchError((error: unknown) => {
        this.assessmentError.set(true);
        this.assessmentErrorStatus.set(
          error instanceof HttpErrorResponse ? error.status : null
        );
        return EMPTY;
      }),
      finalize(() => this.assessmentLoading.set(false))
    );
  }

  private assessmentMatchesCondition(
    code: string,
    condition: PolicyExistenceCondition | undefined
  ): boolean | null {
    if (condition?.field?.toLowerCase()
      !== 'microsoft.security/assessments/status.code') {
      return null;
    }

    const normalizedCode = code.toLowerCase();
    if (Array.isArray(condition.in)) {
      return condition.in.some((value) => String(value).toLowerCase() === normalizedCode);
    }
    if (condition.equals !== undefined) {
      return String(condition.equals).toLowerCase() === normalizedCode;
    }
    return null;
  }
}
