import { Component, Input } from '@angular/core';
import { AzureResource } from '@services/azure/resource-graph.service';
import { PanelVariant, ResourceDetailItem } from '@services/azome/resource-detail.registry';

interface LogAnalyticsWorkspaceResource extends AzureResource {
  properties?: {
    customerId?: string;
    provisioningState?: string;
    retentionInDays?: number;
    sku?: {
      name?: string;
      capacityReservationLevel?: number;
    };
    workspaceCapping?: {
      dailyQuotaGb?: number;
      dataIngestionStatus?: string;
    };
    publicNetworkAccessForIngestion?: string;
    publicNetworkAccessForQuery?: string;
    features?: {
      enableLogAccessUsingOnlyResourcePermissions?: boolean;
    };
  };
}

@Component({
  selector: 'app-log-analytics-workspace-detail',
  standalone: true,
  templateUrl: './log-analytics-workspace.component.html',
  styleUrl: './log-analytics-workspace.component.scss'
})
export class LogAnalyticsWorkspaceComponent implements ResourceDetailItem {
  static readonly preferredVariant: PanelVariant = 'content';

  @Input() resource: LogAnalyticsWorkspaceResource | null = null;

  public get properties(): LogAnalyticsWorkspaceResource['properties'] {
    return this.resource?.properties;
  }
}
