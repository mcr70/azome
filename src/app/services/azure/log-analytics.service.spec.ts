import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@environments/environment';
import { LogAnalyticsService } from './log-analytics.service';

describe('LogAnalyticsService', () => {
  let service: LogAnalyticsService;
  let http: HttpTestingController;
  const baseUrl = `${environment.azure.proxyUrl}/log-analytics-proxy/v1/workspaces`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(LogAnalyticsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('loads the selected workspace schema and sorts tables', () => {
    service.getTables('selected-workspace').subscribe((tables) => {
      expect(tables.map((table) => table.name)).toEqual(['AzureActivity', 'Heartbeat']);
      expect(tables[1].columns[0].name).toBe('TimeGenerated');
    });
    http.expectOne(`${baseUrl}/selected-workspace/metadata`).flush({
      tables: [
        { name: 'Heartbeat', columns: [{ name: 'TimeGenerated', type: 'datetime' }] },
        { name: 'AzureActivity', columns: [] }
      ]
    });
  });

  it('posts unchanged KQL and time range only to the selected workspace', () => {
    const result = { tables: [{ name: 'PrimaryResult', columns: [], rows: [] }] };
    service.query('another-workspace', 'Heartbeat | take 10', 'P1D').subscribe((response) => {
      expect(response).toEqual(result);
    });
    const request = http.expectOne(`${baseUrl}/another-workspace/query`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ query: 'Heartbeat | take 10', timespan: 'P1D' });
    expect(request.request.headers.get('Prefer')).toBe('wait=60');
    request.flush(result);
  });

  it('discovers recent table activity with a single Usage query including non-billable data', () => {
    service.getActiveTableNames('workspace').subscribe((names) => {
      expect(names).toEqual(['Heartbeat', 'AzureActivity']);
    });
    const request = http.expectOne(`${baseUrl}/workspace/query`);
    expect(request.request.body.timespan).toBe('P31D');
    expect(request.request.body.query).toBe(
      'Usage\n| where StartTime >= ago(30d)\n| where Quantity > 0\n| distinct DataType'
    );
    request.flush({ tables: [{
      name: 'PrimaryResult',
      columns: [{ name: 'DataType', type: 'string' }],
      rows: [['Heartbeat'], ['AzureActivity']]
    }] });
  });

  it('does not treat partial activity results as an authoritative empty table list', () => {
    const error = jasmine.createSpy('error');
    service.getActiveTableNames('workspace').subscribe({ error });
    http.expectOne(`${baseUrl}/workspace/query`).flush({
      tables: [], error: { message: 'Incomplete results' }
    });
    expect(error).toHaveBeenCalled();
  });

  it('propagates permission failures', () => {
    const error = jasmine.createSpy('error');
    service.query('workspace', 'Heartbeat', 'PT1H').subscribe({ error });
    http.expectOne(`${baseUrl}/workspace/query`).flush(
      { error: { message: 'Access denied' } }, { status: 403, statusText: 'Forbidden' }
    );
    expect(error).toHaveBeenCalled();
  });
});