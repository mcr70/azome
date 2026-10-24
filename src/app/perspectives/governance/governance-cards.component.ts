/** Defines focused standalone cards for each Governance dashboard domain. */
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AzureResourceDetail } from '@services/azure/resource-graph.service';
import {
  GovernanceCostSummary,
  GovernancePolicySummary,
  GovernanceQuota,
  GovernanceResourceSummary,
  GovernanceSubscription
} from '@services/azure/governance.service';
import { GovernanceDomainCardComponent } from './governance-domain-card.component';

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
export class GovernancePolicyCardComponent {
  @Input({ required: true }) data!: GovernancePolicySummary;
  @Input() loading = false;
  @Input() loaded = true;
  @Output() resourceSelected = new EventEmitter<AzureResourceDetail>();

  /** Builds a policy-state detail model for the selected violation. */
  public selectViolation(violation: GovernancePolicySummary['violations'][number]): void {
    this.resourceSelected.emit({
      id: violation.resource,
      name: violation.resource.split('/').pop() || violation.resource,
      type: 'microsoft.policyinsights/policystates',
      properties: {
        resourceId: violation.resource,
        policyDefinitionName: violation.policy,
        complianceState: violation.state,
        policyDefinitionId: violation.policyDefinitionId,
        policySetDefinitionName: violation.policySetDefinitionName,
        policySetDefinitionId: violation.policySetDefinitionId,
        policyAssignmentName: violation.policyAssignmentName,
        policyAssignmentId: violation.policyAssignmentId,
        timestamp: violation.timestamp
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
