/** Displays ARM metadata for an Azure App Service plan. */
import { Component, Input } from '@angular/core';
import { PanelVariant, ResourceDetailItem } from '@services/azome/resource-detail.registry';

interface AppServicePlanProperties {
  provisioningState?: string;
  status?: string;
  numberOfWorkers?: number;
  workerSize?: string;
  perSiteScaling?: boolean;
  elasticScaleEnabled?: boolean;
  maximumElasticWorkerCount?: number;
  zoneRedundant?: boolean;
  reserved?: boolean;
  hostingEnvironmentProfile?: {
    name?: string;
    id?: string;
  };
  sku?: {
    name?: string;
    tier?: string;
    capacity?: number;
  };
}

interface AppServicePlanResource {
  sku?: {
    name?: string;
    tier?: string;
    capacity?: number;
  };
  properties?: AppServicePlanProperties;
}

/** Shows plan SKU, workers, platform, and scaling configuration. */
@Component({
  selector: 'app-app-service-plan-detail',
  standalone: true,
  imports: [],
  templateUrl: './app-service-plan.component.html',
  styleUrl: './app-service-plan.component.scss'
})
export class AppServicePlanComponent implements ResourceDetailItem {
  static readonly preferredVariant: PanelVariant = 'content';

  @Input() resource: AppServicePlanResource | null = null;

  /** Returns ARM properties when the supplied resource has them. */
  public get properties(): AppServicePlanProperties | undefined {
    return this.resource?.properties;
  }

  /** Returns the plan SKU from its top-level field or properties fallback. */
  public get sku(): AppServicePlanResource['sku'] {
    return this.resource?.sku ?? this.properties?.sku;
  }
}
