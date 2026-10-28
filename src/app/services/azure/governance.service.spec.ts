/** Verifies batched Policy Definition display-name resolution. */
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@environments/environment';
import {
  GovernancePolicyViolationPage,
  GovernanceService,
  GovernanceSnapshot
} from './governance.service';

describe('GovernanceService', () => {
  let service: GovernanceService;
  let httpTesting: HttpTestingController;
  let originalProxyUrl: string;

  beforeEach(() => {
    originalProxyUrl = environment.azure.proxyUrl;
    environment.azure.proxyUrl = '';
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(GovernanceService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    environment.azure.proxyUrl = originalProxyUrl;
    httpTesting.verify();
  });

  it('resolves multiple Policy Definition names in one Resource Graph request', () => {
    const firstId = '/subscriptions/example/providers/Microsoft.Authorization/policyDefinitions/one';
    const secondId = '/subscriptions/example/providers/Microsoft.Authorization/policyDefinitions/two';
    let result: Record<string, string> | undefined;

    service.getPolicyDefinitionDisplayNames([firstId, secondId, firstId]).subscribe((names) => {
      result = names;
    });

    const request = httpTesting.expectOne((candidate) =>
      candidate.url === '/governance-proxy/providers/Microsoft.ResourceGraph/resources'
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body.query).toContain(firstId.toLowerCase());
    expect(request.request.body.query).toContain(secondId.toLowerCase());
    expect(request.request.body.subscriptions.length).toBeGreaterThan(0);
    expect(request.request.body.options.authorizationScopeFilter)
      .toBe('AtScopeAboveAndBelow');
    request.flush({
      data: [
        { id: firstId.toLowerCase(), displayName: 'First policy' },
        { id: secondId.toLowerCase(), displayName: 'Second policy' }
      ]
    });

    expect(result).toEqual({
      [firstId.toLowerCase()]: 'First policy',
      [secondId.toLowerCase()]: 'Second policy'
    });
  });

  it('uses the configured proxy origin for Resource Graph requests', () => {
    environment.azure.proxyUrl = 'https://example.azurewebsites.net';
    const policyId = '/providers/Microsoft.Authorization/policyDefinitions/one';

    service.getPolicyDefinitionDisplayNames([policyId]).subscribe();

    const request = httpTesting.expectOne((candidate) =>
      candidate.url === 'https://example.azurewebsites.net/governance-proxy'
        + '/providers/Microsoft.ResourceGraph/resources'
    );
    expect(request.request.method).toBe('POST');
    request.flush({ data: [] });
  });

  it('does not make a Resource Graph request for an empty member list', () => {
    let result: Record<string, string> | undefined;

    service.getPolicyDefinitionDisplayNames([]).subscribe((names) => {
      result = names;
    });

    expect(result).toEqual({});
    httpTesting.expectNone('/governance-proxy/providers/Microsoft.ResourceGraph/resources');
  });

  it('loads active tabs on demand and force refresh bypasses the cost cache', () => {
    const graphUrl = '/governance-proxy/providers/Microsoft.ResourceGraph/resources'
      + '?api-version=2021-06-01-preview';
    const subscriptionId = 'subscription-1';
    let snapshot: GovernanceSnapshot | undefined;

    service.getSnapshot('subscriptions').subscribe((value) => snapshot = value);
    httpTesting.expectOne(
      '/governance-proxy/subscriptions?api-version=2022-12-01'
    ).flush({ value: [{ subscriptionId, displayName: 'Test subscription', state: 'Enabled' }] });
    httpTesting.expectOne(
      `/governance-proxy/subscriptions/${subscriptionId}`
        + '/providers/Microsoft.Compute/locations/eastus/usages?api-version=2023-09-01'
    ).flush({ value: [] });

    const resourceQueries = httpTesting.match(graphUrl);
    expect(resourceQueries.length).toBe(2);
    expect(resourceQueries.every((request) => !request.request.body.query.includes('PolicyResources')))
      .toBeTrue();
    resourceQueries.forEach((request) => request.flush({ data: [] }));
    httpTesting.expectNone((request) => request.url.includes('Microsoft.CostManagement'));

    service.getSnapshot('subscriptions').subscribe((value) => snapshot = value);
    httpTesting.expectNone(graphUrl);
    httpTesting.expectNone((request) => request.url.includes('Microsoft.Compute/locations'));

    service.getSnapshot('costs').subscribe((value) => snapshot = value);
    httpTesting.expectOne((request) => request.url.includes('Microsoft.CostManagement/query'))
      .flush({ properties: {
        columns: [
          { name: 'ServiceName', type: 'String' },
          { name: 'PreTaxCost', type: 'Number' },
          { name: 'Currency', type: 'String' }
        ],
        rows: [['Compute', 12, 'USD']]
      } });
    httpTesting.expectOne((request) => request.url.includes('Microsoft.CostManagement/forecast'))
      .flush({ properties: {
        columns: [{ name: 'ForecastCost', type: 'Number' }],
        rows: [[15]]
      } });

    service.getSnapshot('costs', true).subscribe((value) => snapshot = value);
    httpTesting.expectOne(
      '/governance-proxy/subscriptions?api-version=2022-12-01'
    ).flush({ value: [{ subscriptionId, displayName: 'Test subscription', state: 'Enabled' }] });
    httpTesting.expectOne((request) => request.url.includes('Microsoft.CostManagement/query'))
      .flush({ properties: {
        columns: [
          { name: 'ServiceName', type: 'String' },
          { name: 'PreTaxCost', type: 'Number' },
          { name: 'Currency', type: 'String' }
        ],
        rows: [['Compute', 14, 'USD']]
      } });
    httpTesting.expectOne((request) => request.url.includes('Microsoft.CostManagement/forecast'))
      .flush({ properties: {
        columns: [{ name: 'ForecastCost', type: 'Number' }],
        rows: [[18]]
      } });

    service.getSnapshot('policies').subscribe((value) => snapshot = value);
    const policyQueries = httpTesting.match(graphUrl);
    expect(policyQueries.length).toBe(3);
    expect(policyQueries.every((request) => request.request.body.query.includes('PolicyResources')))
      .toBeTrue();
    const violationQuery = policyQueries.find((request) =>
      request.request.body.query.includes('project resource=')
    );
    expect(violationQuery?.request.body.options.$top).toBe(30);
    expect(violationQuery?.request.body.query).not.toContain('take 30');
    expect(violationQuery?.request.body.query).toContain(
      'order by resource asc, policy asc, policyDefinitionId asc'
    );
    expect(violationQuery?.request.body.query).toContain(
      'complianceReasonCode=tostring(properties.complianceReasonCode)'
    );
    expect(violationQuery?.request.body.query).toContain(
      'policyDefinitionAction=tostring(properties.policyDefinitionAction)'
    );
    const policySetQuery = policyQueries.find((request) =>
      request.request.body.query.includes('| summarize by policySetDefinitionId')
    );
    expect(policySetQuery).toBeDefined();
    expect(policySetQuery?.request.body.options.authorizationScopeFilter)
      .toBe('AtScopeAboveAndBelow');
    policyQueries.forEach((request) => {
      if (request === violationQuery) {
        request.flush({
          data: [{
            resource: '/subscriptions/subscription-1/resourceGroups/group/providers/Microsoft.Compute/virtualMachines/vm',
            policy: 'Require secure settings',
            state: 'NonCompliant'
          }],
          $skipToken: 'next-page',
          totalRecords: 42
        });
      } else if (request === policySetQuery) {
        request.flush({ data: [{
          id: '/providers/Microsoft.Authorization/policySetDefinitions/benchmark',
          name: 'Microsoft cloud security benchmark'
        }] });
      } else {
        request.flush({ data: [{ compliant: 3, nonCompliant: 14 }] });
      }
    });

    let nextPage: GovernancePolicyViolationPage | undefined;
    const filters = {
      policySetId: '/providers/Microsoft.Authorization/policySetDefinitions/benchmark',
      search: "owner's"
    };
    service.getPolicyViolationsPage(60, 'next-page', filters)
      .subscribe((page) => nextPage = page);
    const nextPageRequest = httpTesting.expectOne(graphUrl);
    expect(nextPageRequest.request.body.options.$top).toBe(60);
    expect(nextPageRequest.request.body.options.$skipToken).toBe('next-page');
    expect(nextPageRequest.request.body.query).toContain(
      "policySetDefinitionId =~ '/providers/microsoft.authorization/policysetdefinitions/benchmark'"
    );
    expect(nextPageRequest.request.body.query).toContain("resource contains 'owner''s'");
    nextPageRequest.flush({ data: [], totalRecords: 42 });
    expect(nextPage?.violations).toEqual([]);
    expect(nextPage?.totalRecords).toBe(42);

    expect(snapshot?.loadedSections).toContain('costs');
    expect(snapshot?.loadedSections).toContain('policy');
    expect(snapshot?.loadedSections).toContain('quotas');
    expect(snapshot?.loadedSections).toContain('resources');
  });
});
