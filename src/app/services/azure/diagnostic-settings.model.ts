import { AzureResource } from './resource-graph.service';

export interface DiagnosticCategory {
  category?: string;
  categoryGroup?: string;
  enabled: boolean;
}

export interface DiagnosticSettingProperties {
  workspaceId?: string;
  storageAccountId?: string;
  eventHubAuthorizationRuleId?: string;
  eventHubName?: string;
  marketplacePartnerId?: string;
  logAnalyticsDestinationType?: string;
  logs?: DiagnosticCategory[];
  metrics?: DiagnosticCategory[];
}

export interface DiagnosticDestination {
  label: string;
  id: string;
  name: string;
  eventHubName?: string;
}

export interface DiagnosticSetting extends AzureResource {
  source: AzureResource;
  properties: DiagnosticSettingProperties;
  destinations: DiagnosticDestination[];
}

export interface DiagnosticSettingsResult {
  settings: DiagnosticSetting[];
  failures: { source: AzureResource; message: string }[];
}

export function diagnosticDestinations(properties: DiagnosticSettingProperties): DiagnosticDestination[] {
  const destinations: DiagnosticDestination[] = [];
  const add = (label: string, id: string | undefined, eventHubName?: string): void => {
    if (id) {
      destinations.push({
        label,
        id,
        name: label === 'Event Hubs authorization rule'
          ? id.split(/\/namespaces\//i).at(-1) ?? id
          : id.split('/').filter(Boolean).at(-1) ?? id,
        eventHubName
      });
    }
  };

  add('Log Analytics workspace', properties.workspaceId);
  add('Storage account', properties.storageAccountId);
  add('Event Hubs authorization rule', properties.eventHubAuthorizationRuleId, properties.eventHubName);
  add('Partner destination', properties.marketplacePartnerId);
  return destinations;
}
