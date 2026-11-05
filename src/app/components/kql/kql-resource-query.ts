import { SelectedAzureResource } from '@services/azome/resource-selection.service';

/**
 * A suggested KQL query tailored for a specific resource or resource selection.
 */
export interface ResourceKqlQueryOption {
  /** Display label for the query option (e.g., 'func-orders (FunctionAppLogs)'). */
  label: string;
  /** Detailed description of what the query targets. */
  description: string;
  /** The generated KQL query string. */
  query: string;
  /** Primary table targeted by the query. */
  tableName: string;
  /** Optional resource ID if the query targets a single resource. */
  resourceId?: string;
}

/**
 * Minimal schema table definition used to validate column existence.
 */
export interface SchemaTableLike {
  name: string;
  columns?: readonly { name: string }[];
}

interface TableDefinition {
  tableName: string;
  columns: string[];
  additionalFilter?: string;
}

/**
 * Resolves the primary log table definitions and projections for a resource type.
 *
 * @param resource Selected resource to inspect.
 * @param availableTableNames Set of table names present in the target workspace.
 * @returns Table definition with candidate table name and projection columns.
 */
function resolveResourceTable(
  resource: SelectedAzureResource,
  availableTableNames?: ReadonlySet<string>
): TableDefinition {
  const type = resource.type.toLowerCase();
  const name = resource.name.toLowerCase();
  const has = (t: string): boolean => availableTableNames ? availableTableNames.has(t) : false;

  // Azure Functions: target function execution logs with wide Message projection
  if (
    type.includes('microsoft.web/sites/functions')
    || (type.includes('microsoft.web/sites') && (name.includes('func') || name.includes('fn-') || name.includes('function')))
  ) {
    if (has('AppTraces') && !has('FunctionAppLogs')) {
      return {
        tableName: 'AppTraces',
        columns: ['TimeGenerated', 'Message', 'SeverityLevel', 'OperationName']
      };
    }
    return {
      tableName: 'FunctionAppLogs',
      columns: ['TimeGenerated', 'Message', 'FunctionName', 'ExceptionDetails'],
      additionalFilter: '| where Category startswith "Function"'
    };
  }

  // Azure App Service
  if (type.includes('microsoft.web/sites')) {
    if (has('AppServiceHTTPLogs') && !has('AppServiceConsoleLogs')) {
      return {
        tableName: 'AppServiceHTTPLogs',
        columns: ['TimeGenerated', 'CsMethod', 'CsUriStem', 'ScStatus', 'TimeTaken']
      };
    }
    return {
      tableName: 'AppServiceConsoleLogs',
      columns: ['TimeGenerated', 'ResultDescription', 'Level']
    };
  }

  // Container Apps
  if (type.includes('microsoft.app/containerapps')) {
    return {
      tableName: 'ContainerAppConsoleLogs_CL',
      columns: ['TimeGenerated', 'Log_s', 'ContainerName_s']
    };
  }

  // Key Vault
  if (type.includes('microsoft.keyvault/vaults')) {
    if (has('KeyVaultVaultEvents')) {
      return {
        tableName: 'KeyVaultVaultEvents',
        columns: ['TimeGenerated', 'OperationName', 'ResultType', 'CallerIPAddress']
      };
    }
    return {
      tableName: 'AzureDiagnostics',
      columns: ['TimeGenerated', 'OperationName', 'ResultType', 'CallerIPAddress']
    };
  }

  // Storage Accounts
  if (type.includes('microsoft.storage/storageaccounts')) {
    return {
      tableName: 'StorageBlobLogs',
      columns: ['TimeGenerated', 'OperationName', 'StatusCode', 'CallerIpAddress', 'Uri']
    };
  }

  // Fallback to AzureDiagnostics
  return {
    tableName: 'AzureDiagnostics',
    columns: ['TimeGenerated', 'ResultDescription', 'Category', 'OperationName', 'ResultType']
  };
}

/**
 * Filters the suggested projection columns against the workspace table's actual schema columns.
 *
 * @param tableName Name of the target table.
 * @param desiredColumns Ideal columns to project.
 * @param schemaMap Optional map of table names to known schema column names.
 * @returns Array of column names confirmed to exist in the schema, or desiredColumns if no schema is provided.
 */
function filterValidColumns(
  tableName: string,
  desiredColumns: string[],
  schemaMap?: Map<string, Set<string>>
): string[] {
  if (!schemaMap || !schemaMap.has(tableName)) {
    return desiredColumns;
  }

  const validColumns = schemaMap.get(tableName)!;
  if (validColumns.size === 0) {
    return desiredColumns;
  }

  const filtered = desiredColumns.filter((col) => validColumns.has(col.toLowerCase()));
  return filtered.length > 0 ? filtered : desiredColumns;
}

/**
 * Formats a KQL query for a given table, resources filter, and projection columns.
 *
 * @param tableName Name of the target table.
 * @param resources Selected resources to target.
 * @param columns Projection column list.
 * @param additionalFilter Optional additional filter line.
 * @returns Formatted multi-line KQL query string.
 */
function formatKqlQuery(
  tableName: string,
  resources: readonly SelectedAzureResource[],
  columns: string[],
  additionalFilter?: string
): string {
  let whereClause: string;

  if (resources.length === 1) {
    const res = resources[0];
    const isStorage = res.type.toLowerCase().includes('microsoft.storage/storageaccounts');
    whereClause = isStorage
      ? `| where _ResourceId startswith '${res.id}'`
      : `| where _ResourceId =~ '${res.id}'`;
  } else {
    const exactIds: string[] = [];
    const prefixIds: string[] = [];

    for (const res of resources) {
      if (res.type.toLowerCase().includes('microsoft.storage/storageaccounts')) {
        prefixIds.push(res.id);
      } else {
        exactIds.push(res.id);
      }
    }

    const conditions: string[] = [];
    if (exactIds.length === 1) {
      conditions.push(`_ResourceId =~ '${exactIds[0]}'`);
    } else if (exactIds.length > 1) {
      conditions.push(`_ResourceId in~ (\n    ${exactIds.map((id) => `'${id}'`).join(',\n    ')}\n  )`);
    }

    for (const pid of prefixIds) {
      conditions.push(`_ResourceId startswith '${pid}'`);
    }

    whereClause = conditions.length === 1
      ? `| where ${conditions[0]}`
      : `| where ${conditions.join('\n    or ')}`;
  }

  const projectColumns = resources.length > 1 && !columns.includes('_ResourceId')
    ? ['TimeGenerated', '_ResourceId', ...columns.filter((c) => c !== 'TimeGenerated')]
    : columns;

  const lines = [
    tableName,
    whereClause
  ];

  if (additionalFilter) {
    lines.push(additionalFilter);
  }

  lines.push(
    `| project ${projectColumns.join(', ')}`,
    '| order by TimeGenerated desc',
    '| take 100'
  );

  return lines.join('\n');
}

/**
 * Formats a union query for multiple resources across diverse tables.
 *
 * @param tableNames List of candidate table names.
 * @param resources Selected resources to target.
 * @returns Formatted multi-line KQL union query string.
 */
function formatUnionKqlQuery(
  tableNames: string[],
  resources: readonly SelectedAzureResource[]
): string {
  const exactIds: string[] = [];
  const prefixIds: string[] = [];

  for (const res of resources) {
    if (res.type.toLowerCase().includes('microsoft.storage/storageaccounts')) {
      prefixIds.push(res.id);
    } else {
      exactIds.push(res.id);
    }
  }

  const conditions: string[] = [];
  if (exactIds.length === 1) {
    conditions.push(`_ResourceId =~ '${exactIds[0]}'`);
  } else if (exactIds.length > 1) {
    conditions.push(`_ResourceId in~ (\n    ${exactIds.map((id) => `'${id}'`).join(',\n    ')}\n  )`);
  }

  for (const pid of prefixIds) {
    conditions.push(`_ResourceId startswith '${pid}'`);
  }

  const whereClause = conditions.length === 1
    ? `| where ${conditions[0]}`
    : `| where ${conditions.join('\n    or ')}`;

  return [
    `union isfuzzy=true ${tableNames.join(', ')}`,
    whereClause,
    '| project TimeGenerated, _ResourceId, Message = coalesce(Message, ResultDescription, Uri), SourceTable = $table',
    '| order by TimeGenerated desc',
    '| take 100'
  ].join('\n');
}

/**
 * Parses available table inputs into a table name set and an optional column map.
 *
 * @param availableTables Input tables either as schema table objects, strings, or a set.
 * @returns Tuple of table name set and schema column map.
 */
function parseTableSchemas(
  availableTables?: readonly SchemaTableLike[] | ReadonlySet<string> | readonly string[]
): { tableNames?: Set<string>; schemaMap?: Map<string, Set<string>> } {
  if (!availableTables) {
    return {};
  }

  if (availableTables instanceof Set) {
    return { tableNames: new Set(availableTables) };
  }

  if (!Array.isArray(availableTables) || availableTables.length === 0) {
    return {};
  }

  const first = availableTables[0];
  if (typeof first === 'string') {
    return { tableNames: new Set(availableTables as readonly string[]) };
  }

  const schemaTables = availableTables as readonly SchemaTableLike[];
  const tableNames = new Set<string>();
  const schemaMap = new Map<string, Set<string>>();

  for (const table of schemaTables) {
    tableNames.add(table.name);
    if (table.columns && table.columns.length > 0) {
      schemaMap.set(table.name, new Set(table.columns.map((col) => col.name.toLowerCase())));
    }
  }

  return { tableNames, schemaMap };
}

/**
 * Builds tailored KQL query options based on the currently selected Azure resources.
 *
 * @param resources Currently selected Azure resources.
 * @param availableTables Optional set, array of table names, or schema table objects from the workspace.
 * @returns List of query options including individual resource queries and combined options.
 */
export function buildResourceKqlQueries(
  resources: readonly SelectedAzureResource[],
  availableTables?: readonly SchemaTableLike[] | ReadonlySet<string> | readonly string[]
): ResourceKqlQueryOption[] {
  if (resources.length === 0) {
    return [];
  }

  const { tableNames, schemaMap } = parseTableSchemas(availableTables);
  const options: ResourceKqlQueryOption[] = [];

  // Generate a tailored query for each individual selected resource
  for (const resource of resources) {
    const tableDef = resolveResourceTable(resource, tableNames);
    const validColumns = filterValidColumns(tableDef.tableName, tableDef.columns, schemaMap);
    options.push({
      label: `${resource.name} (${tableDef.tableName})`,
      description: `Logs for ${resource.name} from ${tableDef.tableName}`,
      query: formatKqlQuery(tableDef.tableName, [resource], validColumns, tableDef.additionalFilter),
      tableName: tableDef.tableName,
      resourceId: resource.id
    });
  }

  return options;
}

/**
 * Builds the default KQL query for the selected resources, or returns null if none are selected.
 *
 * @param resources Currently selected Azure resources.
 * @param availableTables Optional set, array of table names, or schema table objects from the workspace.
 * @returns Formatted default KQL query or null.
 */
export function buildDefaultResourceKqlQuery(
  resources: readonly SelectedAzureResource[],
  availableTables?: readonly SchemaTableLike[] | ReadonlySet<string> | readonly string[]
): string | null {
  const options = buildResourceKqlQueries(resources, availableTables);
  return options.length > 0 ? options[0].query : null;
}
