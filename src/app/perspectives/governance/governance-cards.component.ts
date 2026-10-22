/** Defines focused standalone cards for each Governance dashboard domain. */
import { Component, Input } from '@angular/core';
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
}
