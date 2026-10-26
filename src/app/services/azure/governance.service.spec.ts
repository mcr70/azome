/** Verifies batched Policy Definition display-name resolution. */
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@environments/environment';
import { GovernanceService } from './governance.service';

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
});
