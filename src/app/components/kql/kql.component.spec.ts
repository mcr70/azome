import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { LogAnalyticsQueryResult, LogAnalyticsService } from '@services/azure/log-analytics.service';
import { KqlComponent } from './kql.component';

describe('KqlComponent', () => {
  let fixture: ComponentFixture<KqlComponent>;
  let service: jasmine.SpyObj<LogAnalyticsService>;
  let storage: Map<string, string>;
  const schema = [{ name: 'Heartbeat', columns: [{ name: 'Computer', type: 'string' }] }];

  beforeEach(async () => {
    storage = new Map();
    spyOn(Storage.prototype, 'getItem').and.callFake((key) => storage.get(key) ?? null);
    spyOn(Storage.prototype, 'setItem').and.callFake((key, value) => {
      storage.set(key, value);
    });
    service = jasmine.createSpyObj<LogAnalyticsService>(
      'LogAnalyticsService', ['getTables', 'getActiveTableNames', 'query']
    );
    service.getTables.and.returnValue(of(schema));
    service.getActiveTableNames.and.returnValue(of(['Heartbeat']));
    service.query.and.returnValue(of({ tables: [] }));
    await TestBed.configureTestingModule({
      imports: [KqlComponent],
      providers: [{ provide: LogAnalyticsService, useValue: service }]
    }).compileComponents();
    fixture = TestBed.createComponent(KqlComponent);
    fixture.componentRef.setInput('workspaceId', 'workspace-one');
    fixture.componentRef.setInput('workspaceName', 'Production logs');
    fixture.detectChanges();
  });

  it('opens a modal with compact active table rows without querying table contents', () => {
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('dialog')?.open).toBeTrue();
    expect(element.textContent).toContain('Production logs');
    expect(element.textContent).toContain('Heartbeat');
    expect(element.querySelector('.schema')?.textContent).not.toContain('Computer');
    expect(element.querySelector('.schema details')).toBeNull();
    expect(service.getTables).toHaveBeenCalledOnceWith('workspace-one');
    expect(service.getActiveTableNames).toHaveBeenCalledOnceWith('workspace-one');
    expect(service.query).not.toHaveBeenCalled();
    fixture.componentInstance.tableFilter = 'missing';
    fixture.detectChanges();
    expect(element.textContent).toContain('No matching tables.');
  });

  it('runs a selected table query against the current workspace and renders typed cells', () => {
    service.query.and.returnValue(of({ tables: [{
      name: 'PrimaryResult',
      columns: [
        { name: 'Computer', type: 'string' },
        { name: 'Count', type: 'long' },
        { name: 'Healthy', type: 'bool' },
        { name: 'Data', type: 'dynamic' }
      ],
      rows: [['server-one', 0, false, { key: 'value' }]]
    }] }));
    const element: HTMLElement = fixture.nativeElement;
    (element.querySelector('.table-name') as HTMLButtonElement).click();
    fixture.componentInstance.runQuery();
    fixture.detectChanges();
    expect(service.query).toHaveBeenCalledOnceWith('workspace-one', 'Heartbeat\n| take 10', 'P1D');
    expect(element.querySelectorAll('th').length).toBe(4);
    expect(fixture.componentInstance.sourceScanDurationMs).toBeNull();
    const cells = Array.from(element.querySelectorAll('td')).map((cell) => cell.textContent);
    expect(cells).toEqual(['server-one', '0', 'false', '{"key":"value"}']);
  });

  it('filters by recent activity and switches to all tables without additional requests', () => {
    fixture.componentInstance.tables = [
      ...schema,
      { name: 'AzureActivity', columns: [{ name: 'Category', type: 'string' }] }
    ];
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelectorAll('.table-row').length).toBe(1);
    const scope = element.querySelector<HTMLSelectElement>('[aria-label="Table scope"]')!;
    scope.value = 'all';
    scope.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(element.querySelectorAll('.table-row').length).toBe(2);
    expect(service.getActiveTableNames).toHaveBeenCalledTimes(1);
    expect(service.query).not.toHaveBeenCalled();
  });

  it('loads the default query on name click and keeps columns collapsed until explicitly opened', () => {
    fixture.componentInstance.query = 'Custom query';
    const element: HTMLElement = fixture.nativeElement;
    element.querySelector<HTMLButtonElement>('.table-name')!.click();
    fixture.detectChanges();
    const sources = element.querySelector<HTMLDetailsElement>('.source-tables')!;
    expect(sources.open).toBeFalse();
    expect(element.querySelector('.column-info')).toBeNull();
    expect(fixture.componentInstance.query).toBe('Heartbeat\n| take 10');
    expect(element.querySelector('.table-query')).toBeNull();
    sources.open = true;
    sources.dispatchEvent(new Event('toggle'));
    fixture.detectChanges();
    const columns = element.querySelector<HTMLDetailsElement>('.column-info')!;
    expect(columns.open).toBeTrue();
    expect(columns.textContent).toContain('Computer');
    expect(columns.textContent).toContain('string');
    expect(service.query).not.toHaveBeenCalled();
  });

  it('scans on first source-panel open and only rescans manually after query edits', () => {
    const scan = spyOn(fixture.componentInstance, 'scanSourceTables').and.callThrough();
    const element: HTMLElement = fixture.nativeElement;
    const sources = element.querySelector<HTMLDetailsElement>('.source-tables')!;
    fixture.componentInstance.query = 'Heartbeat | take 10';
    expect(scan).not.toHaveBeenCalled();
    sources.open = true;
    sources.dispatchEvent(new Event('toggle'));
    fixture.detectChanges();
    expect(scan).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.sourceTables).toEqual(schema);
    expect(fixture.componentInstance.sourceScanDurationMs).toBeGreaterThanOrEqual(0);
    fixture.componentInstance.query = 'print Value = 1';
    sources.open = false;
    sources.dispatchEvent(new Event('toggle'));
    sources.open = true;
    sources.dispatchEvent(new Event('toggle'));
    expect(scan).toHaveBeenCalledTimes(1);
    element.querySelector<HTMLButtonElement>('.rescan-button')!.click();
    fixture.detectChanges();
    expect(scan).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.sourceTables).toEqual([]);
    expect(element.textContent).toContain('No known source tables found.');
    expect(service.query).not.toHaveBeenCalled();
    expect(service.getTables).toHaveBeenCalledTimes(1);
  });

  it('finds multiple source tables in union and join queries across the full schema', () => {
    const activity = { name: 'AzureActivity', columns: [{ name: 'Category', type: 'string' }] };
    fixture.componentInstance.tables = [...schema, activity];
    fixture.componentInstance.query = 'union Heartbeat, AzureActivity, Heartbeat | take 10';
    fixture.componentInstance.scanSourceTables();
    expect(fixture.componentInstance.sourceTables).toEqual([...schema, activity]);
    fixture.detectChanges();
    const columns = (fixture.nativeElement as HTMLElement)
      .querySelectorAll<HTMLDetailsElement>('.column-info');
    expect(columns[0].open).toBeTrue();
    expect(columns[1].open).toBeFalse();
    fixture.componentInstance.query = "['Heartbeat'] | join (AzureActivity) on Computer";
    fixture.componentInstance.scanSourceTables();
    expect(fixture.componentInstance.sourceTables).toEqual([...schema, activity]);
    fixture.componentInstance.query = 'HeartbeatArchive | take 10';
    fixture.componentInstance.scanSourceTables();
    expect(fixture.componentInstance.sourceTables).toEqual([]);
  });

  it('defers saved-query discovery until opening the source panel and resets it on a new query', () => {
    fixture.componentInstance.selectSavedQuery({ name: 'Saved', query: 'Heartbeat | take 10' });
    expect(fixture.componentInstance.sourceScanDurationMs).toBeNull();
    fixture.componentInstance.onSourceTablesToggle(true);
    expect(fixture.componentInstance.sourceTables).toEqual(schema);
    fixture.componentInstance.selectSavedQuery({ name: 'Other', query: 'print Value = 1' });
    expect(fixture.componentInstance.sourceScanDurationMs).toBeNull();
    expect(fixture.componentInstance.sourceTables).toEqual([]);
    fixture.componentInstance.onSourceTablesToggle(true);
    expect(fixture.componentInstance.sourceTables).toEqual([]);
  });

  it('shows all tables on activity failure and can retry successfully', () => {
    service.getActiveTableNames.and.returnValue(throwError(() => new Error('Usage denied')));
    fixture.componentInstance.loadTables();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Usage denied');
    expect(fixture.componentInstance.tableScope).toBe('all');
    expect(element.querySelectorAll('.table-row').length).toBe(1);
    service.getActiveTableNames.and.returnValue(of(['Heartbeat']));
    fixture.componentInstance.loadTables();
    expect(fixture.componentInstance.activityError).toBeNull();
  });

  it('distinguishes no recent activity from an unavailable activity query', () => {
    service.getActiveTableNames.and.returnValue(of([]));
    fixture.componentInstance.loadTables();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('No tables with recorded ingestion in the last 30 days.');
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('summarizes categories only when the selected table contains the Category column', () => {
    fixture.componentInstance.selectTable({
      name: 'AzureActivity',
      columns: [{ name: 'Category', type: 'string' }]
    });
    expect(fixture.componentInstance.query).toBe(
      'AzureActivity\n| summarize Count = count() by Category\n| order by Count desc'
    );

    fixture.componentInstance.selectTable(schema[0]);
    expect(fixture.componentInstance.query).toBe('Heartbeat\n| take 10');
  });

  it('uses take 10 when the selected table has no columns', () => {
    fixture.componentInstance.selectTable({ name: 'EmptyTable', columns: [] });
    expect(fixture.componentInstance.query).toBe('EmptyTable\n| take 10');
  });

  it('cancels in-flight requests and clears the previous workspace when it changes', () => {
    const response = new Subject<LogAnalyticsQueryResult>();
    service.query.and.returnValue(response);
    fixture.componentInstance.query = 'Heartbeat | take 10';
    fixture.componentInstance.runQuery();
    expect(response.observed).toBeTrue();
    fixture.componentRef.setInput('workspaceId', 'workspace-two');
    fixture.detectChanges();
    expect(response.observed).toBeFalse();
    expect(fixture.componentInstance.loading).toBeFalse();
    expect(fixture.componentInstance.query).toBe('');
    expect(fixture.componentInstance.results).toBeNull();
    expect(fixture.componentInstance.selectedTable).toBeNull();
    expect(service.getTables).toHaveBeenCalledWith('workspace-two');
    expect(service.getActiveTableNames).toHaveBeenCalledWith('workspace-two');
  });

  it('cancels both schema discovery requests when the dialog is destroyed', () => {
    const tables = new Subject<typeof schema>();
    const activeNames = new Subject<string[]>();
    service.getTables.and.returnValue(tables);
    service.getActiveTableNames.and.returnValue(activeNames);
    fixture.componentInstance.loadTables();
    expect(tables.observed).toBeTrue();
    expect(activeNames.observed).toBeTrue();
    fixture.destroy();
    expect(tables.observed).toBeFalse();
    expect(activeNames.observed).toBeFalse();
  });

  it('reports schema failures with retry and query failures with service details', () => {
    service.getTables.and.returnValue(throwError(() => new Error('Schema unavailable')));
    fixture.componentInstance.loadTables();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Schema unavailable');
    service.getTables.and.returnValue(of(schema));
    fixture.componentInstance.loadTables();
    expect(fixture.componentInstance.tablesError).toBeNull();

    service.query.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 400,
      error: { error: { message: 'Invalid query', innererror: { message: 'Unknown column' } } }
    })));
    fixture.componentInstance.query = 'invalid';
    fixture.componentInstance.runQuery();
    fixture.detectChanges();
    expect(element.textContent).toContain('Unknown column\nInvalid query');
    expect(fixture.componentInstance.loading).toBeFalse();
  });

  it('shows the deepest semantic error first with codes and diagnostic identifiers', () => {
    service.query.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 400,
      headers: new HttpHeaders({ 'x-ms-request-id': 'request-123' }),
      error: { error: {
        code: 'BadArgumentError',
        message: 'The request had some invalid properties',
        correlationId: 'correlation-123',
        innererror: {
          code: 'SemanticError',
          message: 'A semantic error occurred.',
          innererror: {
            code: 'SEM0100',
            message: "Failed to resolve table or column expression named 'FunctionAppLogsS'"
          }
        }
      } }
    })));
    fixture.componentInstance.query = 'FunctionAppLogsS | take 10';
    fixture.componentInstance.runQuery();
    fixture.detectChanges();
    const message = fixture.componentInstance.queryError!;
    expect(message.startsWith('SEM0100: Failed to resolve table')).toBeTrue();
    expect(message).toContain("'FunctionAppLogsS'");
    expect(message).toContain('SemanticError: A semantic error occurred.');
    expect(message).toContain('BadArgumentError: The request had some invalid properties');
    expect(message).toContain('HTTP 400');
    expect(message).toContain('Correlation ID: correlation-123');
    expect(message).toContain('Request ID: request-123');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('SEM0100');
  });

  it('includes all error details without repeating duplicate messages', () => {
    service.query.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 400,
      error: { error: {
        message: 'Invalid query',
        details: [
          { code: 'SYN0002', message: 'Unexpected token on line 2' },
          { message: 'Unknown column' },
          { message: 'Unknown column' }
        ]
      } }
    })));
    fixture.componentInstance.query = 'invalid';
    fixture.componentInstance.runQuery();
    const message = fixture.componentInstance.queryError!;
    expect(message).toContain('SYN0002: Unexpected token on line 2');
    expect(message.match(/Unknown column/g)?.length).toBe(1);
    expect(message).toContain('Invalid query');
  });

  it('handles plain-text and JSON-text proxy errors and network failures', () => {
    for (const [body, status, expected] of [
      ['Proxy upstream timed out', 502, 'Proxy upstream timed out'],
      ['{"error":{"code":"Forbidden","message":"Access denied"}}', 403, 'Forbidden: Access denied'],
      [null, 0, 'Network request failed.']
    ] as const) {
      service.query.and.returnValue(throwError(() => new HttpErrorResponse({ error: body, status })));
      fixture.componentInstance.query = 'Heartbeat';
      fixture.componentInstance.runQuery();
      expect(fixture.componentInstance.queryError).toContain(expected);
    }
  });

  it('shows partial-result errors and empty-result states', () => {
    service.query.and.returnValue(of({
      tables: [{ name: 'PrimaryResult', columns: [], rows: [] }],
      error: { code: 'PartialError', message: 'Result truncated' }
    }));
    fixture.componentInstance.query = 'Heartbeat';
    fixture.componentInstance.runQuery();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Partial results: Result truncated');
    expect(element.textContent).toContain('No results.');
  });

  it('cancels on demand, prevents duplicate execution and releases requests on destroy', () => {
    const response = new Subject<LogAnalyticsQueryResult>();
    service.query.and.returnValue(response);
    fixture.componentInstance.runQuery();
    expect(service.query).not.toHaveBeenCalled();
    fixture.componentInstance.query = 'Heartbeat';
    fixture.componentInstance.runQuery();
    fixture.componentInstance.runQuery();
    expect(service.query).toHaveBeenCalledTimes(1);
    fixture.componentInstance.cancelQuery();
    expect(response.observed).toBeFalse();
    fixture.componentInstance.runQuery();
    fixture.destroy();
    expect(response.observed).toBeFalse();
  });

  it('saves named queries in local storage and restores them when reopened', () => {
    fixture.componentInstance.queryName = ' Heartbeats ';
    fixture.componentInstance.query = 'Heartbeat | take 10';
    fixture.componentInstance.saveQuery();
    expect(JSON.parse(storage.get('azome.savedKqlQueries')!)).toEqual([
      { name: 'Heartbeats', query: 'Heartbeat | take 10' }
    ]);
    fixture.destroy();
    const reopened = TestBed.createComponent(KqlComponent);
    expect(reopened.componentInstance.savedQueries).toEqual([
      { name: 'Heartbeats', query: 'Heartbeat | take 10' }
    ]);
    reopened.destroy();
  });

  it('updates an existing query name case-insensitively and rejects blank values', () => {
    fixture.componentInstance.saveQuery();
    expect(storage.size).toBe(0);
    fixture.componentInstance.queryName = 'Heartbeats';
    fixture.componentInstance.query = 'Heartbeat | take 10';
    fixture.componentInstance.saveQuery();
    fixture.componentInstance.queryName = 'heartbeats';
    fixture.componentInstance.query = 'Heartbeat | take 20';
    fixture.componentInstance.saveQuery();
    expect(fixture.componentInstance.savedQueries).toEqual([
      { name: 'heartbeats', query: 'Heartbeat | take 20' }
    ]);
  });

  it('selects and deletes saved queries inside the dropdown without running them', () => {
    fixture.componentInstance.queryName = 'Heartbeats';
    fixture.componentInstance.query = 'Heartbeat | take 10';
    fixture.componentInstance.saveQuery();
    fixture.componentInstance.query = 'Other query';
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const menu = element.querySelector<HTMLDetailsElement>('.saved-queries-menu')!;
    menu.open = true;
    element.querySelector<HTMLButtonElement>('.saved-query-select')!.click();
    expect(fixture.componentInstance.query).toBe('Heartbeat | take 10');
    expect(menu.open).toBeFalse();
    expect(service.query).not.toHaveBeenCalled();
    menu.open = true;
    element.querySelector<HTMLButtonElement>('.delete-query')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.savedQueries).toEqual([]);
    expect(JSON.parse(storage.get('azome.savedKqlQueries')!)).toEqual([]);
    expect(fixture.componentInstance.query).toBe('Heartbeat | take 10');
    expect(element.textContent).toContain('No saved queries.');
  });

  it('reports malformed saved data without preventing the editor from opening', () => {
    storage.set('azome.savedKqlQueries', '{invalid');
    const reopened = TestBed.createComponent(KqlComponent);
    expect(reopened.componentInstance.savedQueries).toEqual([]);
    expect(reopened.componentInstance.savedQueryError).toContain('could not be loaded');
    reopened.destroy();
  });

  it('preserves saved queries when local storage writes fail', () => {
    fixture.componentInstance.queryName = 'Heartbeats';
    fixture.componentInstance.query = 'Heartbeat | take 10';
    fixture.componentInstance.saveQuery();
    (Storage.prototype.setItem as jasmine.Spy).and.throwError('Quota exceeded');
    fixture.componentInstance.deleteSavedQuery('Heartbeats');
    expect(fixture.componentInstance.savedQueries.length).toBe(1);
    expect(fixture.componentInstance.savedQueryError).toContain('could not be written');
    fixture.componentInstance.queryName = 'Other query';
    fixture.componentInstance.saveQuery();
    expect(fixture.componentInstance.savedQueries.length).toBe(1);
  });

  it('emits close for Escape and the close button', () => {
    const close = spyOn(fixture.componentInstance.close, 'emit');
    const element: HTMLElement = fixture.nativeElement;
    element.querySelector('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(close).toHaveBeenCalledTimes(1);
    (element.querySelector('[aria-label="Close KQL dialog"]') as HTMLButtonElement).click();
    expect(close).toHaveBeenCalledTimes(2);
  });
});