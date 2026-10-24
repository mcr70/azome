/** Displays policy evaluation metadata for a non-compliant resource. */
import { JsonPipe } from '@angular/common';
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
import { EMPTY, Subject, of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { PolicyDefinitionDetailComponent } from './policy-definition.component';

interface PolicyViolationProperties {
  resourceId?: string;
  policyDefinitionName?: string;
  policyDefinitionId?: string;
  policySetDefinitionName?: string;
  policySetDefinitionId?: string;
  complianceState?: string;
  policyAssignmentName?: string;
  policyAssignmentId?: string;
  timestamp?: string;
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
  private readonly policyIdChanges = new Subject<string | null>();

  public readonly policyJson = signal<unknown | null>(null);
  public readonly policyJsonLoading = signal(false);
  public readonly policyJsonError = signal(false);

  // States for collapsible section and tabs
  public readonly isDetailsOpen = signal(false);
  public readonly activeTab = signal<'details' | 'json'>('details');

  constructor() {
    this.policyIdChanges.pipe(
      switchMap((policyId) => {
        this.policyJson.set(null);
        this.policyJsonError.set(false);

        if (!policyId) {
          this.policyJsonLoading.set(false);
          return EMPTY;
        }

        this.policyJsonLoading.set(true);
        return this.governance.getPolicyJson(policyId).pipe(
          catchError(() => {
            this.policyJsonError.set(true);
            return of(null);
          }),
          tap((policy) => {
            this.policyJson.set(policy);
            this.policyJsonLoading.set(false);
          })
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();
  }

  /** Loads the selected policy definition when the detail panel resource changes. */
  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['resource']) {
      this.policyIdChanges.next(this.properties?.policyDefinitionId ?? null);
      this.isDetailsOpen.set(false);
    }
  }

  /** Toggles the collapsible policy definition details section. */
  public toggleDetails(): void {
    this.isDetailsOpen.update((open) => !open);
  }

  /** Switches between details and json tabs. */
  public selectTab(tab: 'details' | 'json'): void {
    this.activeTab.set(tab);
  }

  /** Opens the standalone Policy Set dialog using its definition ID. */
  public openPolicySetDetails(): void {
    this.policySetDialog.open(this.properties?.policySetDefinitionId);
  }

  /** Returns policy evaluation properties when the selected resource includes them. */
  public get properties(): PolicyViolationProperties | undefined {
    return this.resource?.properties;
  }
}
