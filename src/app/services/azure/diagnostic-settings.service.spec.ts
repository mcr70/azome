import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@environments/environment';
import { AzureResource } from './resource-graph.service';
import { DiagnosticSettingsService } from './diagnostic-settings.service';
import { DiagnosticSettingsResult, diagnosticDestinations } from './diagnostic-settings.model';

describe('DiagnosticSettingsService', () => {
  let service: DiagnosticSettingsService;
  let http: HttpTestingController;
  const subscriptionId = `/subscriptions/${environment.azure.subscriptionId}`;
  const source: AzureResource = {
    id: `${subscriptionId}/resourceGroups/test/providers/Microsoft.Web/sites/orders`,
    name: 'orders',
    type: 'Microsoft.Web/sites',
    resourceGroup: 'test',
    location: 'westeurope'
  };
  const graphUrl = `${environment.azure.resourceManagerUrl}`
    + '/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01';
  const diagnosticUrl = (id: string): string => `${environment.azure.resourceManagerUrl}${id}`
    + '/providers/Microsoft.Insights/diagnosticSettings?api-version=2021-05-01-preview';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(DiagnosticSettingsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('discovers every inventory page and preserves source, destination and category data', () => {
    let result: DiagnosticSettingsResult | undefined;
    service.getDiagnosticSettings().subscribe((value) => result = value);
    const firstPage = http.expectOne(graphUrl);
    expect(firstPage.request.body.subscriptions).toEqual([environment.azure.subscriptionId]);
    expect(firstPage.request.body.query).not.toContain('union ResourceContainers');
    expect(firstPage.request.body.query).toContain('where type !in~');
    firstPage.flush({ data: [source], $skipToken: 'next' });
    const nextPage = http.expectOne(graphUrl);
    expect(nextPage.request.body.options.$skipToken).toBe('next');
    nextPage.flush({ data: [] });
    const properties = {
      workspaceId: `${subscriptionId}/resourceGroups/logs/providers/Microsoft.OperationalInsights/workspaces/law`,
      logs: [{ categoryGroup: 'allLogs', enabled: true }],
      metrics: [{ category: 'AllMetrics', enabled: false }]
    };
    http.expectOne(diagnosticUrl(source.id)).flush({
      value: [{ id: `${source.id}/providers/Microsoft.Insights/diagnosticSettings/send-logs`,
        name: 'send-logs', properties }]
    });
    http.expectOne(diagnosticUrl(subscriptionId)).flush({ value: [] });

    expect(result?.failures).toEqual([]);
    expect(result?.settings[0].source).toEqual(source);
    expect(result?.settings[0].properties).toEqual(properties);
    expect(result?.settings[0].destinations[0].name).toBe('law');
  });

  it('checks storage service children and deduplicates inventory resources', () => {
    const storage = {
      ...source,
      id: `${subscriptionId}/resourceGroups/test/providers/Microsoft.Storage/storageAccounts/store`,
      name: 'store',
      type: 'Microsoft.Storage/storageAccounts'
    };
    service.getDiagnosticSettings().subscribe();
    http.expectOne(graphUrl).flush({ data: [storage, storage] });
    const requests = http.match((request) => request.method === 'GET');
    expect(requests.length).toBe(6);
    for (const child of ['blobServices', 'fileServices', 'queueServices', 'tableServices']) {
      expect(requests.some((request) =>
        request.request.urlWithParams === diagnosticUrl(`${storage.id}/${child}/default`)
      )).toBeTrue();
    }
    requests.forEach((request) => request.flush({ value: [] }));
  });

  it('does not request settings for resource groups, Network Watchers or route tables', () => {
    let result: DiagnosticSettingsResult | undefined;
    service.getDiagnosticSettings().subscribe((value) => result = value);
    const excludedTypes = [
      'Microsoft.Resources/subscriptions/resourceGroups',
      'Microsoft.Network/networkWatchers',
      'Microsoft.Network/routeTables'
    ];
    const inventory = http.expectOne(graphUrl);
    for (const type of excludedTypes) {
      expect(inventory.request.body.query).toContain(type.toLowerCase());
    }
    inventory.flush({
      data: [
        source,
        ...excludedTypes.map((type, index) => ({
          ...source,
          id: `/unsupported/${index}`,
          type
        }))
      ]
    });
    const requests = http.match((request) => request.method === 'GET');
    expect(requests.map((request) => request.request.urlWithParams)).toEqual([
      diagnosticUrl(source.id),
      diagnosticUrl(subscriptionId)
    ]);
    requests.forEach((request) => request.flush({ value: [] }));
    expect(result).toEqual({ settings: [], failures: [] });
  });

  it('keeps successful results and reports access failures, skipping only explicit unsupported errors', () => {
    spyOn(console, 'error');
    let result: DiagnosticSettingsResult | undefined;
    service.getDiagnosticSettings().subscribe((value) => result = value);
    const unsupported = { ...source, id: `${source.id}-unsupported` };
    http.expectOne(graphUrl).flush({ data: [source, unsupported] });
    http.expectOne(diagnosticUrl(source.id)).flush(
      { error: { code: 'AuthorizationFailed', message: 'No read permission' } },
      { status: 403, statusText: 'Forbidden' }
    );
    http.expectOne(diagnosticUrl(unsupported.id)).flush(
      { error: { code: 'DiagnosticSettingsNotSupported' } },
      { status: 400, statusText: 'Bad Request' }
    );
    http.expectOne(diagnosticUrl(subscriptionId)).flush({
      value: [{ id: 'subscription-setting', name: 'activity-export', properties: {} }]
    });
    expect(result?.settings.length).toBe(1);
    expect(result?.failures.length).toBe(1);
    expect(result?.failures[0].source).toEqual(source);
    expect(result?.failures[0].message).toContain('No read permission');
  });

  it('limits ARM concurrency to six requests', () => {
    service.getDiagnosticSettings().subscribe();
    http.expectOne(graphUrl).flush({
      data: Array.from({ length: 8 }, (_, index) => ({ ...source, id: `${source.id}-${index}` }))
    });
    const initial = http.match((request) => request.method === 'GET');
    expect(initial.length).toBe(6);
    initial.forEach((request) => request.flush({ value: [] }));
    const remaining = http.match((request) => request.method === 'GET');
    expect(remaining.length).toBe(3);
    remaining.forEach((request) => request.flush({ value: [] }));
  });

  it('propagates inventory errors instead of reporting an empty successful scan', () => {
    const error = jasmine.createSpy('error');
    service.getDiagnosticSettings().subscribe({ error });
    http.expectOne(graphUrl).flush('Forbidden', { status: 403, statusText: 'Forbidden' });
    expect(error).toHaveBeenCalled();
  });

  it('includes all destination types and retains the Event Hub namespace and rule', () => {
    const destinations = diagnosticDestinations({
      workspaceId: '/workspaces/law',
      storageAccountId: '/storageAccounts/archive',
      eventHubAuthorizationRuleId: '/namespaces/events/authorizationRules/send',
      eventHubName: 'logs',
      marketplacePartnerId: '/partners/observability'
    });
    expect(destinations.length).toBe(4);
    expect(destinations[2].name).toBe('events/authorizationRules/send');
    expect(destinations[2].eventHubName).toBe('logs');
    expect(diagnosticDestinations({})).toEqual([]);
  });
});
