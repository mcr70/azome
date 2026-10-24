/** Displays the selected Azure Policy Set definition in a standalone application dialog. */
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GovernanceService } from '@services/azure/governance.service';
import { Subscription, catchError, of, switchMap, tap } from 'rxjs';
import { PolicyParametersTableComponent } from './policy-parameters-table.component';
import { PolicySetDetailsDialogService } from './policy-set-details-dialog.service';

interface PolicySetParameter {
  type?: string;
  metadata?: {
    displayName?: string;
    description?: string;
  };
  defaultValue?: unknown;
  allowedValues?: unknown[];
}

interface PolicySetMember {
  displayName?: string;
  policyDefinitionId?: string;
  policyDefinitionReferenceId?: string;
  definitionVersion?: string;
  parameters?: Record<string, unknown>;
}

interface PolicySetDefinition {
  id?: string;
  name?: string;
  properties?: {
    displayName?: string;
    description?: string;
    policyType?: string;
    version?: string;
    parameters?: Record<string, PolicySetParameter>;
    policyDefinitions?: PolicySetMember[];
  };
}

const POLICY_DEFINITION_PAGE_SIZE = 25;

@Component({
  selector: 'app-policy-set-details-dialog',
  standalone: true,
  imports: [PolicyParametersTableComponent],
  templateUrl: './policy-set-details-dialog.component.html',
  styleUrl: './policy-set-details-dialog.component.scss'
})
export class PolicySetDetailsDialogComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly governance = inject(GovernanceService);
  private readonly dialogState = inject(PolicySetDetailsDialogService);
  private readonly dialogElement = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private policyRequest?: Subscription;
  private requestedPolicySetId: string | null = null;

  public readonly selectedPolicySetId = this.dialogState.policySetId;

  public readonly expandedDefinitionRef = signal<string | null>(null);
  public readonly policySet = signal<PolicySetDefinition | null>(null);
  public readonly loading = signal(false);
  public readonly error = signal(false);
  public readonly definitionNames = signal<Record<string, string>>({});
  public readonly definitionNamesLoading = signal(false);
  public readonly definitionNamesError = signal(false);
  public readonly filter = signal('');
  public readonly page = signal(0);
  public readonly sortKey = signal<'name' | 'reference' | 'version' | 'effect'>('name');
  public readonly sortDirection = signal<'asc' | 'desc'>('asc');

  private readonly filteredDefinitions = computed(() => {
    const members = this.policySet()?.properties?.policyDefinitions ?? [];
    const filter = this.filter().trim().toLowerCase();

    return members.filter((member) =>
      this.displayNameFor(member).toLowerCase().includes(filter)
      || (member.policyDefinitionId ?? '').toLowerCase().includes(filter)
      || (member.policyDefinitionReferenceId ?? '').toLowerCase().includes(filter)
      || this.effectFor(member).toLowerCase().includes(filter)
    );
  });

  private readonly sortedDefinitions = computed(() => {
    const key = this.sortKey();
    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    return [...this.filteredDefinitions()].sort((left, right) =>
      this.sortValue(left, key).localeCompare(this.sortValue(right, key)) * direction
    );
  });

  public readonly pageCount = computed(() => Math.max(
    1,
    Math.ceil(this.sortedDefinitions().length / POLICY_DEFINITION_PAGE_SIZE)
  ));

  public readonly visibleDefinitions = computed(() => {
    const start = this.page() * POLICY_DEFINITION_PAGE_SIZE;
    return this.sortedDefinitions().slice(start, start + POLICY_DEFINITION_PAGE_SIZE);
  });

  public readonly resultCount = computed(() => this.sortedDefinitions().length);

  /** Retries loading the selected Policy Set after a request failure. */
  public retry(): void {
    const policySetId = this.dialogState.policySetId();
    if (policySetId) {
      this.loadPolicySet(policySetId);
    }
  }

  constructor() {
    effect(() => {
      const policySetId = this.dialogState.policySetId();
      const dialog = this.dialogElement()?.nativeElement;

      if (policySetId) {
        if (dialog && !dialog.open) {
          dialog.showModal();
        }
        if (this.requestedPolicySetId !== policySetId) {
          this.requestedPolicySetId = policySetId;
          this.loadPolicySet(policySetId);
        }
        return;
      }

      this.requestedPolicySetId = null;
      this.policyRequest?.unsubscribe();
      this.policyRequest = undefined;
      if (dialog?.open) {
        dialog.close();
      }
      this.policySet.set(null);
      this.definitionNames.set({});
      this.definitionNamesLoading.set(false);
      this.definitionNamesError.set(false);
      this.loading.set(false);
      this.error.set(false);
      this.filter.set('');
      this.page.set(0);
    });
  }

  /** Closes the modal while preserving the view that launched it. */
  public close(): void {
    this.dialogState.close();
  }

  /** Handles Escape without allowing the dialog state to drift from the dialog service. */
  public handleCancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  /** Filters the included policy definitions by ID or reference ID. */
  public updateFilter(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.filter.set(input.value);
    this.page.set(0);
  }

  /** Clears the Policy Definition search and returns to the first filtered page. */
  public clearFilter(): void {
    this.filter.set('');
    this.page.set(0);
  }

  /** Sorts the table by a supported Policy Definition member property. */
  public sortBy(key: 'name' | 'reference' | 'version' | 'effect'): void {
    if (this.sortKey() === key) {
      this.sortDirection.update((direction) => direction === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDirection.set('asc');
    }
    this.page.set(0);
  }

  /** Returns the accessible sorting state for a table column. */
  public sortState(key: 'name' | 'reference' | 'version' | 'effect'): string {
    if (this.sortKey() !== key) {
      return 'none';
    }
    return this.sortDirection() === 'asc' ? 'ascending' : 'descending';
  }

  /** Returns a compact sort direction indicator for a sortable column. */
  public sortIndicator(key: 'name' | 'reference' | 'version' | 'effect'): string {
    if (this.sortKey() !== key) {
      return '↕';
    }
    return this.sortDirection() === 'asc' ? '↑' : '↓';
  }

  /** Returns the resolved policy name and falls back to its Azure resource ID. */
  public displayNameFor(member: PolicySetMember): string {
    const definitionId = member.policyDefinitionId ?? '';
    return member.displayName
      || this.definitionNames()[definitionId.toLowerCase()]
      || definitionId
      || 'Unavailable';
  }

  /** Returns the resolved policy name and flags for badges. */
  public getProcessedPolicyDisplay(member: PolicySetMember): {
    displayName: string;
    isDeprecated: boolean;
    isPreview: boolean;
  } {
    const definitionId = member.policyDefinitionId ?? '';
    const rawName = member.displayName
      || this.definitionNames()[definitionId.toLowerCase()]
      || definitionId
      || 'Unavailable';

    const isDeprecated = rawName.startsWith('[Deprecated]');
    const isPreview = rawName.startsWith('[Preview]');

    let displayName = rawName;
    if (isDeprecated) {
      displayName = displayName.replace(/^\[Deprecated\]:\s*/, '').replace(/^\[Deprecated\]\s*/, '');
    } else if (isPreview) {
      displayName = displayName.replace(/^\[Preview\]:\s*/, '').replace(/^\[Preview\]\s*/, '');
    }

    return { displayName, isDeprecated, isPreview };
  }



  /** Moves to the previous definition page when one is available. */
  public previousPage(): void {
    this.page.update((current) => Math.max(0, current - 1));
  }

  /** Moves to the next definition page when one is available. */
  public nextPage(): void {
    this.page.update((current) => Math.min(this.pageCount() - 1, current + 1));
  }

  /** Extracts a member policy's configured effect when it is directly present. */
  public effectFor(member: PolicySetMember): string {
    const effect = member.parameters?.['effect'];
    if (effect && typeof effect === 'object' && 'value' in effect) {
      return String(effect.value);
    }
    return typeof effect === 'string' ? effect : 'Not specified';
  }

  public toggleDefinitionRow(refId: string | undefined): void {
    if (!refId) return;
    if (this.expandedDefinitionRef() === refId) {
      this.expandedDefinitionRef.set(null);
    } else {
      this.expandedDefinitionRef.set(refId);
    }
  }

  public getParameterEntries(params: any): Array<{ key: string; value: any }> {
    if (!params || typeof params !== 'object') return [];
    return Object.entries(params).map(([key, val]: [string, any]) => {
      const actualValue = val && typeof val === 'object' && 'value' in val ? val.value : val;
      return { key, value: actualValue };
    });
  }

  public formatParamValue(value: unknown): string {
    if (value === undefined || value === null) return 'Not specified';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(value);
  }

  public getRawJsonForDefinition(member: any): string {
    return JSON.stringify(member, null, 2);
  }

  /** Loads the Policy Set definition through the existing Azure Resource Manager service. */
  private loadPolicySet(policySetId: string): void {
    this.policySet.set(null);
    this.definitionNames.set({});
    this.definitionNamesLoading.set(false);
    this.definitionNamesError.set(false);
    this.loading.set(true);
    this.error.set(false);
    this.filter.set('');
    this.page.set(0);

    this.policyRequest?.unsubscribe();
    this.policyRequest = this.governance.getPolicyJson(policySetId).pipe(
      tap((definition: PolicySetDefinition) => {
        this.policySet.set(definition ?? null);
        this.loading.set(false);
      }),
      switchMap((definition: PolicySetDefinition) => {
        const policyDefinitionIds = (definition?.properties?.policyDefinitions ?? [])
          .map((member) => member.policyDefinitionId ?? '')
          .filter(Boolean);
        if (policyDefinitionIds.length === 0) {
          return of({});
        }

        this.definitionNamesLoading.set(true);
        return this.governance.getPolicyDefinitionDisplayNames(policyDefinitionIds).pipe(
          catchError(() => {
            this.definitionNamesError.set(true);
            return of({});
          })
        );
      }),
      catchError(() => {
        this.error.set(true);
        this.loading.set(false);
        return of({});
      }),
      tap((definitionNames) => {
        this.definitionNames.set(definitionNames);
        this.definitionNamesLoading.set(false);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();
  }

  /** Returns the selected sort value for one policy definition reference. */
  private sortValue(
    member: PolicySetMember,
    key: 'name' | 'reference' | 'version' | 'effect'
  ): string {
    switch (key) {
      case 'name':
        return this.displayNameFor(member).toLocaleLowerCase();
      case 'reference':
        return (member.policyDefinitionReferenceId ?? '').toLocaleLowerCase();
      case 'version':
        return (member.definitionVersion ?? '').toLocaleLowerCase();
      case 'effect':
        return this.effectFor(member).toLocaleLowerCase();
    }
  }
}