/** Defines focused standalone cards for each Governance dashboard domain. */
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  signal
} from '@angular/core';
import { AzureResourceDetail } from '@services/azure/resource-graph.service';
import {
  GovernanceCostSummary,
  GovernancePolicyFilters,
  GovernancePolicySet,
  GovernancePolicySummary,
  GovernanceQuota,
  GovernanceResourceSummary,
  GovernanceSubscription
} from '@services/azure/governance.service';
import { GovernanceDomainCardComponent } from './governance-domain-card.component';

type PolicyViolationGrouping = 'resource' | 'violation';

interface PolicyViolationGroup {
  key: string;
  label: string;
  violations: GovernancePolicySummary['violations'];
  policySetName?: string;
}

/** Shows cumulative cost, forecast, and cost distribution by service. */
@Component({
  selector: 'app-governance-cost-card',
  standalone: true,
  imports: [GovernanceDomainCardComponent],
  templateUrl: './governance-cost-card.component.html',
  styleUrl: './governance-cards.component.scss'
})
export class GovernanceCostCardComponent {
  @Input({ required: true }) data!: GovernanceCostSummary;
  @Input() loading = false;
  @Input() loaded = true;

  /** Formats cost values with the billing currency from Cost Management. */
  public formatCost(value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
      return 'Unavailable';
    }
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: this.data.currency,
      maximumFractionDigits: 0
    }).format(value);
  }
}

/** Lists accessible subscriptions and quota limits nearing capacity. */
@Component({
  selector: 'app-governance-subscriptions-card',
  standalone: true,
  imports: [GovernanceDomainCardComponent],
  templateUrl: './governance-subscriptions-card.component.html',
  styleUrl: './governance-cards.component.scss'
})
export class GovernanceSubscriptionsCardComponent {
  @Input({ required: true }) subscriptions: GovernanceSubscription[] = [];
  @Input({ required: true }) quotas: GovernanceQuota[] = [];
  @Input() quotasLoading = false;
  @Input() quotasLoaded = true;
  @Output() resourceSelected = new EventEmitter<AzureResourceDetail>();

  /** Builds the resource detail model shown when a subscription is selected. */
  public selectSubscription(subscription: GovernanceSubscription): void {
    this.resourceSelected.emit({
      id: `/subscriptions/${subscription.subscriptionId}`,
      name: subscription.displayName,
      type: 'microsoft.resources/subscriptions',
      properties: {
        subscriptionId: subscription.subscriptionId,
        state: subscription.state,
        tenantId: subscription.tenantId,
        authorizationSource: subscription.authorizationSource
      }
    });
  }
}

/** Summarizes policy compliance and a sample of non-compliant resources. */
@Component({
  selector: 'app-governance-policy-card',
  standalone: true,
  imports: [GovernanceDomainCardComponent],
  templateUrl: './governance-policy-card.component.html',
  styleUrl: './governance-cards.component.scss'
})
export class GovernancePolicyCardComponent implements OnChanges {
  @Input({ required: true }) data!: GovernancePolicySummary;
  @Input() loading = false;
  @Input() loaded = true;
  @Input() pageLoading = false;
  @Input() pageIndex = 0;
  @Input() pageSize = 30;
  @Input() policySets: GovernancePolicySet[] = [];
  @Input() filters: GovernancePolicyFilters = {};
  @Output() resourceSelected = new EventEmitter<AzureResourceDetail>();
  @Output() filtersChanged = new EventEmitter<GovernancePolicyFilters>();
  @Output() pageChange = new EventEmitter<{
    direction: 'next' | 'previous' | 'size';
    pageSize?: number;
  }>();

  public readonly pageSizes = [30, 60, 100];
  public readonly grouping = signal<PolicyViolationGrouping>('resource');
  public selectedPolicySetId = '';
  public searchText = '';

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['filters']) {
      this.selectedPolicySetId = this.filters.policySetId ?? '';
      this.searchText = this.filters.search ?? '';
    }
  }

  public get groupedViolations(): PolicyViolationGroup[] {
    if (this.grouping() === 'resource') {
      return this.groupBy(
        this.data.violations,
        (violation) => violation.resource,
        (violation) => violation.resource.split('/').pop() || violation.resource
      );
    }

    return this.groupBy(
      this.data.violations,
      (violation) => violation.policyDefinitionId ?? violation.policy,
      (violation) => violation.policy || 'Policy definition'
    ).map((group) => ({
      ...group,
      policySetName: group.violations[0]?.policySetDefinitionName,
      violations: this.uniqueResources(group.violations)
    }));
  }

  public setGrouping(grouping: PolicyViolationGrouping): void {
    this.grouping.set(grouping);
  }

  public changePageSize(event: Event): void {
    const pageSize = Number((event.target as HTMLSelectElement).value);
    if (this.pageSizes.includes(pageSize)) {
      this.pageChange.emit({ direction: 'size', pageSize });
    }
  }

  public changePolicySet(event: Event): void {
    this.selectedPolicySetId = (event.target as HTMLSelectElement).value;
  }

  public changeSearch(event: Event): void {
    this.searchText = (event.target as HTMLInputElement).value;
  }

  public applyFilters(): void {
    if (this.pageLoading) {
      return;
    }
    this.filtersChanged.emit({
      policySetId: this.selectedPolicySetId || undefined,
      search: this.searchText.trim() || undefined
    });
  }

  public requestPage(direction: 'next' | 'previous'): void {
    this.pageChange.emit({ direction });
  }

  private groupBy(
    violations: GovernancePolicySummary['violations'],
    getKey: (violation: GovernancePolicySummary['violations'][number]) => string,
    getLabel: (violation: GovernancePolicySummary['violations'][number]) => string
  ): PolicyViolationGroup[] {
    const groups = new Map<string, PolicyViolationGroup>();
    violations.forEach((violation) => {
      const key = getKey(violation);
      const group = groups.get(key) ?? {
        key,
        label: getLabel(violation),
        violations: []
      };
      group.violations.push(violation);
      groups.set(key, group);
    });
    return [...groups.values()];
  }

  private uniqueResources(
    violations: GovernancePolicySummary['violations']
  ): GovernancePolicySummary['violations'] {
    return [...new Map(violations.map((violation) => [violation.resource, violation])).values()];
  }

  /** Opens the detail panel for one policy violation. */
  public selectViolation(violation: GovernancePolicySummary['violations'][number]): void {
    this.selectResourceViolations([violation]);
  }

  /** Opens the detail panel with every violation attached to the selected resource. */
  public selectResourceViolations(
    violations: GovernancePolicySummary['violations']
  ): void {
    const firstViolation = violations[0];
    if (!firstViolation) {
      return;
    }

    this.resourceSelected.emit({
      id: firstViolation.resource,
      name: firstViolation.resource.split('/').pop() || firstViolation.resource,
      type: 'microsoft.policyinsights/policystates',
      properties: {
        resourceId: firstViolation.resource,
        policyDefinitionName: firstViolation.policy,
        complianceState: firstViolation.state,
        complianceReasonCode: firstViolation.complianceReasonCode,
        policyDefinitionAction: firstViolation.policyDefinitionAction,
        policyDefinitionId: firstViolation.policyDefinitionId,
        policySetDefinitionName: firstViolation.policySetDefinitionName,
        policySetDefinitionId: firstViolation.policySetDefinitionId,
        policyAssignmentName: firstViolation.policyAssignmentName,
        policyAssignmentId: firstViolation.policyAssignmentId,
        timestamp: firstViolation.timestamp,
        policyViolations: violations.map((violation) => ({
          resourceId: violation.resource,
          policyDefinitionName: violation.policy,
          policyDefinitionId: violation.policyDefinitionId,
          policySetDefinitionName: violation.policySetDefinitionName,
          policySetDefinitionId: violation.policySetDefinitionId,
          complianceState: violation.state,
                    complianceReasonCode: violation.complianceReasonCode,
                    policyDefinitionAction: violation.policyDefinitionAction,
          policyAssignmentName: violation.policyAssignmentName,
          policyAssignmentId: violation.policyAssignmentId,
          timestamp: violation.timestamp
        }))
      }
    });
  }
}

/** Lists resources missing one or more required governance tags. */
@Component({
  selector: 'app-governance-tags-card',
  standalone: true,
  imports: [GovernanceDomainCardComponent],
  templateUrl: './governance-tags-card.component.html',
  styleUrl: './governance-cards.component.scss'
})
export class GovernanceTagsCardComponent {
  @Input({ required: true }) resources!: GovernanceResourceSummary;
  @Input() loading = false;
  @Input() loaded = true;
}

/** Lists production resources protected by Azure resource locks. */
@Component({
  selector: 'app-governance-locks-card',
  standalone: true,
  imports: [GovernanceDomainCardComponent],
  templateUrl: './governance-locks-card.component.html',
  styleUrl: './governance-cards.component.scss'
})
export class GovernanceLocksCardComponent {
  @Input({ required: true }) resources!: GovernanceResourceSummary;
  @Input() loading = false;
  @Input() loaded = true;
}
