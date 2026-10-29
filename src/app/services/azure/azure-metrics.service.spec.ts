import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@environments/environment';
import { AzureMetricsService } from './azure-metrics.service';

describe('AzureMetricsService', () => {
  let service: AzureMetricsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(AzureMetricsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('loads and caches metric definitions for a resource', () => {
    const resourceId = '/subscriptions/sub/resourceGroups/apps'
      + '/providers/Microsoft.Web/sites/orders';
    const url = `${environment.azure.resourceManagerUrl}${resourceId}`
      + '/providers/Microsoft.Insights/metricDefinitions';
    const definitions = [{
      name: { value: 'Requests', localizedValue: 'Requests' },
      primaryAggregationType: 'Total',
      supportedAggregationTypes: ['Total', 'Count'],
      unit: 'Count'
    }];
    let first: unknown;
    let second: unknown;

    service.getMetricDefinitions(resourceId).subscribe((result) => first = result);
    service.getMetricDefinitions(resourceId).subscribe((result) => second = result);

    const request = http.expectOne((request) => request.url === url);
    expect(request.request.params.get('api-version')).toBe('2018-01-01');
    request.flush({ value: definitions });

    expect(first).toEqual(definitions);
    expect(second).toEqual(definitions);
  });

  it('queries one metric with the requested aggregation and time range', () => {
    const resourceId = '/subscriptions/sub/resourceGroups/apps'
      + '/providers/Microsoft.Web/sites/orders';
    const url = `${environment.azure.resourceManagerUrl}${resourceId}`
      + '/providers/Microsoft.Insights/metrics';
    const start = new Date('2026-10-28T08:00:00.000Z');
    const end = new Date('2026-10-29T08:00:00.000Z');
    let result: unknown;

    service.getMetric(resourceId, 'Requests', 'Total', start, end, 'PT15M')
      .subscribe((response) => result = response);

    const request = http.expectOne((request) => request.url === url);
    expect(request.request.params.get('api-version')).toBe('2018-01-01');
    expect(request.request.params.get('metricnames')).toBe('Requests');
    expect(request.request.params.get('aggregation')).toBe('Total');
    expect(request.request.params.get('timespan'))
      .toBe(`${start.toISOString()}/${end.toISOString()}`);
    expect(request.request.params.get('interval')).toBe('PT15M');
    request.flush({
      value: [{
        name: { value: 'Requests', localizedValue: 'Requests' },
        unit: 'Count',
        timeseries: [{ data: [{ timeStamp: '2026-10-29T08:00:00Z', total: 12 }] }]
      }]
    });

    expect(result).toEqual({
      name: 'Requests',
      unit: 'Count',
      data: [{ timeStamp: '2026-10-29T08:00:00Z', total: 12 }]
    });
  });

  it('propagates Azure Monitor permission failures', () => {
    const resourceId = '/subscriptions/sub/resourceGroups/apps'
      + '/providers/Microsoft.Web/sites/orders';
    const error = jasmine.createSpy('error');

    service.getMetricDefinitions(resourceId).subscribe({ error });
    http.expectOne((request) => request.url.includes('/metricDefinitions'))
      .flush('Forbidden', { status: 403, statusText: 'Forbidden' });

    expect(error).toHaveBeenCalled();
  });
});
