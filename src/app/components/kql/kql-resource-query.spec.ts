import { SelectedAzureResource } from '@services/azome/resource-selection.service';
import {
  buildDefaultResourceKqlQuery,
  buildResourceKqlQueries
} from './kql-resource-query';

describe('kql-resource-query', () => {
  const functionResource: SelectedAzureResource = {
    id: '/subscriptions/sub-1/resourceGroups/rg-test/providers/Microsoft.Web/sites/func-orders',
    name: 'func-orders',
    type: 'microsoft.web/sites',
    resourceGroup: 'rg-test'
  };

  const appServiceResource: SelectedAzureResource = {
    id: '/subscriptions/sub-1/resourceGroups/rg-test/providers/Microsoft.Web/sites/web-frontend',
    name: 'web-frontend',
    type: 'microsoft.web/sites',
    resourceGroup: 'rg-test'
  };

  const containerAppResource: SelectedAzureResource = {
    id: '/subscriptions/sub-1/resourceGroups/rg-test/providers/Microsoft.App/containerApps/worker-app',
    name: 'worker-app',
    type: 'microsoft.app/containerapps',
    resourceGroup: 'rg-test'
  };

  const keyVaultResource: SelectedAzureResource = {
    id: '/subscriptions/sub-1/resourceGroups/rg-test/providers/Microsoft.KeyVault/vaults/kv-secrets',
    name: 'kv-secrets',
    type: 'microsoft.keyvault/vaults',
    resourceGroup: 'rg-test'
  };

  const genericResource: SelectedAzureResource = {
    id: '/subscriptions/sub-1/resourceGroups/rg-test/providers/Microsoft.Network/networkSecurityGroups/nsg-core',
    name: 'nsg-core',
    type: 'microsoft.network/networksecuritygroups',
    resourceGroup: 'rg-test'
  };

  it('returns empty array when no resources are selected', () => {
    expect(buildResourceKqlQueries([])).toEqual([]);
    expect(buildDefaultResourceKqlQuery([])).toBeNull();
  });

  describe('single resource query generation', () => {
    it('generates FunctionAppLogs query for Azure Function with sensible projection', () => {
      const options = buildResourceKqlQueries([functionResource]);

      expect(options.length).toBe(1);
      expect(options[0].label).toBe('func-orders (FunctionAppLogs)');
      expect(options[0].tableName).toBe('FunctionAppLogs');
      expect(options[0].query).toContain('FunctionAppLogs');
      expect(options[0].query).toContain(`| where _ResourceId =~ '${functionResource.id}'`);
      expect(options[0].query).toContain('| where Category startswith "Function"');
      expect(options[0].query).toContain('| project TimeGenerated, Message, FunctionName, ExceptionDetails');
      expect(options[0].query).toContain('| order by TimeGenerated desc');
      expect(options[0].query).toContain('| take 100');
    });

    it('falls back to AppTraces for Function when workspace only has AppTraces', () => {
      const available = ['AppTraces', 'AzureDiagnostics'];
      const options = buildResourceKqlQueries([functionResource], available);

      expect(options.length).toBe(1);
      expect(options[0].tableName).toBe('AppTraces');
      expect(options[0].query).toContain('AppTraces');
      expect(options[0].query).toContain('| project TimeGenerated, Message, SeverityLevel, OperationName');
    });

    it('generates AppServiceConsoleLogs query for App Service', () => {
      const options = buildResourceKqlQueries([appServiceResource]);

      expect(options.length).toBe(1);
      expect(options[0].label).toBe('web-frontend (AppServiceConsoleLogs)');
      expect(options[0].tableName).toBe('AppServiceConsoleLogs');
      expect(options[0].query).toContain('AppServiceConsoleLogs');
      expect(options[0].query).toContain(`| where _ResourceId =~ '${appServiceResource.id}'`);
      expect(options[0].query).toContain('| project TimeGenerated, ResultDescription, Level');
    });

    it('generates ContainerAppConsoleLogs_CL query for Container App', () => {
      const options = buildResourceKqlQueries([containerAppResource]);

      expect(options.length).toBe(1);
      expect(options[0].tableName).toBe('ContainerAppConsoleLogs_CL');
      expect(options[0].query).toContain('ContainerAppConsoleLogs_CL');
      expect(options[0].query).toContain('| project TimeGenerated, Log_s, ContainerName_s');
    });

    it('generates AzureDiagnostics for Key Vault by default', () => {
      const options = buildResourceKqlQueries([keyVaultResource]);

      expect(options.length).toBe(1);
      expect(options[0].tableName).toBe('AzureDiagnostics');
      expect(options[0].query).toContain('AzureDiagnostics');
      expect(options[0].query).toContain('| project TimeGenerated, OperationName, ResultType, CallerIPAddress');
    });

    it('uses KeyVaultVaultEvents for Key Vault when present in available tables', () => {
      const options = buildResourceKqlQueries([keyVaultResource], ['KeyVaultVaultEvents']);

      expect(options.length).toBe(1);
      expect(options[0].tableName).toBe('KeyVaultVaultEvents');
      expect(options[0].query).toContain('KeyVaultVaultEvents');
    });

    it('generates AzureDiagnostics fallback for generic resource', () => {
      const options = buildResourceKqlQueries([genericResource]);

      expect(options.length).toBe(1);
      expect(options[0].tableName).toBe('AzureDiagnostics');
      expect(options[0].query).toContain('AzureDiagnostics');
      expect(options[0].query).toContain('| project TimeGenerated, ResultDescription, Category, OperationName, ResultType');
    });

    it('buildDefaultResourceKqlQuery returns query string for single resource', () => {
      const query = buildDefaultResourceKqlQuery([functionResource]);
      expect(query).toContain('FunctionAppLogs');
      expect(query).toContain(functionResource.id);
    });

    it('filters out non-existent columns when table schema is provided', () => {
      const tableWithSubsetColumns = [
        {
          name: 'FunctionAppLogs',
          columns: [{ name: 'TimeGenerated' }, { name: 'Message' }]
        }
      ];
      const options = buildResourceKqlQueries([functionResource], tableWithSubsetColumns);

      expect(options.length).toBe(1);
      expect(options[0].query).toContain('| project TimeGenerated, Message');
      expect(options[0].query).not.toContain('ExceptionDetails');
      expect(options[0].query).not.toContain('FunctionName');
    });
  });

  describe('multiple resources query generation', () => {
    it('generates combined query when multiple resources share the same target table', () => {
      const secondFunc: SelectedAzureResource = {
        id: '/subscriptions/sub-1/resourceGroups/rg-test/providers/Microsoft.Web/sites/func-payments',
        name: 'func-payments',
        type: 'microsoft.web/sites',
        resourceGroup: 'rg-test'
      };

      const options = buildResourceKqlQueries([functionResource, secondFunc]);

      // Should offer combined table query first, then individual queries, then AzureDiagnostics
      expect(options[0].label).toBe('All selected (FunctionAppLogs)');
      expect(options[0].query).toContain('FunctionAppLogs');
      expect(options[0].query).toContain(`'${functionResource.id}'`);
      expect(options[0].query).toContain(`'${secondFunc.id}'`);
      expect(options[0].query).toContain('| where Category startswith "Function"');
      expect(options[0].query).toContain('| project TimeGenerated, _ResourceId, Message, FunctionName, ExceptionDetails');

      // Individual options present
      expect(options.some((o) => o.label === 'func-orders (FunctionAppLogs)')).toBeTrue();
      expect(options.some((o) => o.label === 'func-payments (FunctionAppLogs)')).toBeTrue();

      // Fallback combined AzureDiagnostics option present
      expect(options.some((o) => o.label === 'All selected (AzureDiagnostics)')).toBeTrue();
    });

    it('generates options per resource plus combined AzureDiagnostics when types differ', () => {
      const options = buildResourceKqlQueries([functionResource, keyVaultResource]);

      // Individual options
      expect(options.some((o) => o.label === 'func-orders (FunctionAppLogs)')).toBeTrue();
      expect(options.some((o) => o.label.includes('kv-secrets'))).toBeTrue();

      // Combined AzureDiagnostics option
      const combined = options.find((o) => o.label === 'All selected (AzureDiagnostics)');
      expect(combined).toBeDefined();
      expect(combined?.query).toContain('AzureDiagnostics');
      expect(combined?.query).toContain(functionResource.id);
      expect(combined?.query).toContain(keyVaultResource.id);
    });
  });
});
