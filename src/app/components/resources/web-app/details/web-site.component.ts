/** Displays ARM metadata for an Azure Web App or Function App. */
import { Component, Input } from '@angular/core';
import { PanelVariant, ResourceDetailItem } from '@services/azome/resource-detail.registry';

interface WebSiteConfiguration {
  linuxFxVersion?: string;
  windowsFxVersion?: string;
  alwaysOn?: boolean;
  minTlsVersion?: string;
  ftpsState?: string;
  http20Enabled?: boolean;
}

interface WebSiteProperties {
  kind?: string;
  state?: string;
  availabilityState?: string;
  defaultHostName?: string;
  hostNames?: string[];
  serverFarmId?: string;
  httpsOnly?: boolean;
  enabled?: boolean;
  siteConfig?: WebSiteConfiguration;
}

interface WebSiteResource {
  kind?: string;
  properties?: WebSiteProperties;
}

/** Shows site kind, runtime, hosting plan, HTTPS, and selected site settings. */
@Component({
  selector: 'app-web-site-detail',
  standalone: true,
  imports: [],
  templateUrl: './web-site.component.html',
  styleUrl: './web-site.component.scss'
})
export class WebSiteComponent implements ResourceDetailItem {
  static readonly preferredVariant: PanelVariant = 'content';

  @Input() resource: WebSiteResource | null = null;

  /** Returns ARM properties when the supplied resource has them. */
  public get properties(): WebSiteProperties | undefined {
    return this.resource?.properties;
  }

  /** Returns the site runtime reported by its operating-system-specific setting. */
  public get runtime(): string | null {
    const siteConfig = this.properties?.siteConfig;
    return siteConfig?.linuxFxVersion || siteConfig?.windowsFxVersion || null;
  }

  /** Returns the kind reported on either the resource or its properties. */
  public get siteKind(): string {
    return this.resource?.kind || this.properties?.kind || '-';
  }

  /** Returns the hosting plan name from its full ARM resource ID. */
  public get planName(): string | null {
    const planId = this.properties?.serverFarmId;
    return planId?.split('/').pop() || null;
  }
}
