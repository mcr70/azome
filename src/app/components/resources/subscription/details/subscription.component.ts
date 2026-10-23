/** Displays governance metadata for an Azure subscription. */
import { Component, Input } from '@angular/core';
import { PanelVariant, ResourceDetailItem } from '@services/azome/resource-detail.registry';

interface SubscriptionProperties {
  subscriptionId?: string;
  state?: string;
  tenantId?: string;
  authorizationSource?: string;
}

interface SubscriptionResource {
  id?: string;
  name?: string;
  properties?: SubscriptionProperties;
}

/** Shows the subscription identity and access state supplied by Azure Resource Manager. */
@Component({
  selector: 'app-subscription-detail',
  standalone: true,
  imports: [],
  templateUrl: './subscription.component.html',
  styleUrl: './subscription.component.scss'
})
export class SubscriptionDetailComponent implements ResourceDetailItem {
  static readonly preferredVariant: PanelVariant = 'content';

  @Input() resource: SubscriptionResource | null = null;

  /** Returns subscription properties when the selected resource contains them. */
  public get properties(): SubscriptionProperties | undefined {
    return this.resource?.properties;
  }
}
