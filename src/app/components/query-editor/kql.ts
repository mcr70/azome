import type { QueryEditorExtensions } from './query-editor.component';

export interface KqlTableSchema {
  name: string;
  columns: readonly string[];
}

export interface KqlCompletionSchema {
  tables: readonly KqlTableSchema[];

  /** Whether table and column names match regardless of case (true for Resource Graph). */
  ignoreCase?: boolean;

  /** Known paths inside dynamic columns, e.g. "properties.storageProfile.osDisk". */
  dynamicPaths?: ReadonlySet<string>;
}

/** Azure Resource Graph tables, see "Azure Resource Graph table and resource type reference". */
export const RESOURCE_GRAPH_TABLES: readonly string[] = [
  'AdvisorResources',
  'AlertsManagementResources',
  'AppServiceResources',
  'AuthorizationResources',
  'ChaosResources',
  'CommunityGalleryResources',
  'ComputeResources',
  'DesktopVirtualizationResources',
  'DnsResources',
  'EdgeOrderResources',
  'ExtendedLocationResources',
  'FeatureResources',
  'GuestConfigurationResources',
  'HealthResourceChanges',
  'HealthResources',
  'InsightResources',
  'IoTSecurityResources',
  'KubernetesConfigurationResources',
  'MaintenanceResources',
  'ManagedServicesResources',
  'NetworkResources',
  'PatchAssessmentResources',
  'PatchInstallationResources',
  'PolicyResources',
  'RecoveryServicesResources',
  'ResourceChanges',
  'ResourceContainerChanges',
  'ResourceContainers',
  'Resources',
  'SecurityResources',
  'ServiceFabricResources',
  'ServiceHealthResources',
  'SpotResources',
  'SupportResources'
];

/** Columns shared by (almost) all Azure Resource Graph tables. */
export const RESOURCE_GRAPH_COLUMNS: readonly string[] = [
  'id',
  'name',
  'type',
  'tenantId',
  'kind',
  'location',
  'resourceGroup',
  'subscriptionId',
  'managedBy',
  'sku',
  'plan',
  'properties',
  'tags',
  'identity',
  'zones',
  'extendedLocation'
];

const IDENTIFIER = /^[A-Za-z_]\w*$/;
const MAX_DYNAMIC_PATHS = 5000;
const MAX_DYNAMIC_DEPTH = 6;

/**
 * Creates a lazy loader for KQL highlighting and completion. CodeMirror-based modules are
 * imported dynamically, so they are not part of the initial bundle.
 * @param getSchema Returns the current schema; table names for highlighting are read on load
 */
export function kqlEditorExtensions(getSchema: () => KqlCompletionSchema): QueryEditorExtensions {
  return async () => {
    const [{ kql }, { kqlCompletion }] = await Promise.all([
      import('./kql-language'),
      import('./kql-completion')
    ]);
    const schema = getSchema();
    return [
      kql(schema.tables.map((table) => table.name), { ignoreTableCase: schema.ignoreCase }),
      kqlCompletion(getSchema)
    ];
  };
}

/**
 * Collects paths of nested objects in result rows, e.g. "properties.storageProfile.osDisk".
 * Arrays are not traversed and keys that are not plain identifiers are skipped.
 * @param rows Result rows
 * @param target Set where the paths are added
 */
export function collectDynamicPaths(rows: readonly Record<string, unknown>[], target: Set<string>): void {
  const visit = (value: unknown, path: string, depth: number): void => {
    if (target.size >= MAX_DYNAMIC_PATHS || depth > MAX_DYNAMIC_DEPTH) {
      return;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (IDENTIFIER.test(key)) {
        const childPath = `${path}.${key}`;
        target.add(childPath);
        visit(child, childPath, depth + 1);
      }
    }
  };

  for (const row of rows) {
    for (const [column, value] of Object.entries(row)) {
      if (IDENTIFIER.test(column)) {
        visit(value, column, 1);
      }
    }
  }
}
