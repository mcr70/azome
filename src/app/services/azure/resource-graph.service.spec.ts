import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@environments/environment';
import { AzureTaggedAppResource, ResourceGraphService } from './resource-graph.service';

describe('ResourceGraphService tagged apps', () => {
  let service: ResourceGraphService;
  let http: HttpTestingController;
  const url = `${environment.azure.resourceManagerUrl}/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01`;
  const resource: AzureTaggedAppResource = {
    id: '/subscriptions/test/resourceGroups/data/providers/Microsoft.DocumentDB/databaseAccounts/orders',
    name: 'orders',
    type: 'microsoft.documentdb/databaseaccounts',
    tags: { 'azome-apps': 'Orders, Reporting' }
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ResourceGraphService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('queries tagged resources without restricting resource types', () => {
    let resources: AzureTaggedAppResource[] | undefined;
    service.getTaggedApplicationResources().subscribe((result) => resources = result);

    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.body.subscriptions).toEqual([environment.azure.subscriptionId]);
    expect(request.request.body.query).toContain("where isnotempty(tags['azome-apps'])");
    expect(request.request.body.query).not.toMatch(/where type/i);
    expect(request.request.body.options.resultFormat).toBe('objectArray');
    request.flush({ data: [resource] });

    expect(resources).toEqual([resource]);
  });

  it('collects every page before emitting the result', () => {
    const results: AzureTaggedAppResource[][] = [];
    service.getTaggedApplicationResources().subscribe((result) => results.push(result));

    http.expectOne(url).flush({ data: [resource], $skipToken: 'next-page' });
    expect(results).toEqual([]);

    const secondPage = http.expectOne(url);
    expect(secondPage.request.body.options.$skipToken).toBe('next-page');
    const otherResource = { ...resource, id: 'second', name: 'second' };
    secondPage.flush({ data: [otherResource] });

    expect(results).toEqual([[resource, otherResource]]);
  });

  it('returns an empty list when there are no tagged resources', () => {
    let resources: AzureTaggedAppResource[] | undefined;
    service.getTaggedApplicationResources().subscribe((result) => resources = result);
    http.expectOne(url).flush({ data: [] });
    expect(resources).toEqual([]);
  });

  it('propagates page errors rather than returning partial results', () => {
    const next = jasmine.createSpy('next');
    const error = jasmine.createSpy('error');
    service.getTaggedApplicationResources().subscribe({ next, error });
    http.expectOne(url).flush({ data: [resource], $skipToken: 'next-page' });
    http.expectOne(url).flush('Forbidden', { status: 403, statusText: 'Forbidden' });

    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});
