import { Component, Input } from '@angular/core';
import { AzureResource } from '@services/azure/resource-graph.service';
import { PanelVariant, ResourceDetailItem } from '@services/azome/resource-detail.registry';

interface DataCollectionRuleResource extends AzureResource {
  properties?: {
    immutableId?: string;
    provisioningState?: string;
    description?: string;
    dataFlows?: Array<{
      streams?: string[];
      destinations?: string[];
    }>;
    destinations?: {
      logAnalytics?: Array<{
        name?: string;
        workspaceResourceId?: string;
        workspaceId?: string;
      }>;
    };
  };
}

@Component({
  selector: 'app-data-collection-rule-detail',
  standalone: true,
  imports: [],
  templateUrl: './data-collection-rule.component.html',
  styleUrl: './data-collection-rule.component.scss'
})
export class DataCollectionRuleComponent implements ResourceDetailItem {
  static readonly preferredVariant: PanelVariant = 'content';

  @Input() resource: DataCollectionRuleResource | null = null;

  public get properties(): DataCollectionRuleResource['properties'] {
    return this.resource?.properties;
  }

  public get dataFlows() {
    return this.properties?.dataFlows ?? [];
  }

  public get logAnalyticsDestinations() {
    return this.properties?.destinations?.logAnalytics ?? [];
  }
}