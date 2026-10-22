import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { By } from '@angular/platform-browser';
import { QueryEditorComponent } from './components/query-editor/query-editor.component';
import { RESOURCE_GRAPH_TABLES } from './components/query-editor/kql';
import { AuthService } from './services/azome/auth.service';
import { ResourceSelectionService } from './services/azome/resource-selection.service';
import { ProfileService } from './services/azure/profile.service';
import {
  ResourceGraphQueryResult,
  ResourceGraphService
} from './services/azure/resource-graph.service';
import { DEFAULT_PERSPECTIVES } from './components/preferences/perspective-preference.model';
import { Router } from '@angular/router';
import { EMPTY, of, throwError } from 'rxjs';

describe('AppComponent', () => {
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    window.localStorage.removeItem('azome.savedResourceGraphQueries');
    window.localStorage.removeItem('azome.perspectivePreferences');
    router = jasmine.createSpyObj<Router>('Router', ['navigate', 'navigateByUrl']);
    Object.defineProperty(router, 'events', { value: EMPTY });
    Object.defineProperty(router, 'url', { value: '/rg' });

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: AuthService, useValue: { isAuthenticated$: EMPTY, user$: EMPTY } },
        { provide: ProfileService, useValue: { getMyProfile: () => EMPTY } },
        { provide: ResourceGraphService, useValue: { executeQuery: () => EMPTY } },
        { provide: Router, useValue: router }
      ]
    }).compileComponents();
  });

  afterEach(() => {
    window.localStorage.removeItem('azome.savedResourceGraphQueries');
    window.localStorage.removeItem('azome.perspectivePreferences');
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('opens the built-in table list without running or changing the query', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const executeQuery = spyOn(TestBed.inject(ResourceGraphService), 'executeQuery');
    app.resourceGraphDialogOpen = true;
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const trigger = element.querySelector<HTMLButtonElement>('.resource-graph-tables-button')!;
    const panel = element.querySelector<HTMLElement>('#resource-graph-tables')!;
    expect(panel.matches(':popover-open')).toBeFalse();
    expect(trigger.textContent).toContain(`Available tables (${RESOURCE_GRAPH_TABLES.length})`);

    trigger.click();
    fixture.detectChanges();

    expect(panel.matches(':popover-open')).toBeTrue();
    expect(Array.from(panel.querySelectorAll('li')).map((item) => item.textContent?.trim()))
      .toEqual([...RESOURCE_GRAPH_TABLES]);
    expect(panel.textContent).toContain('This list is not loaded from Azure.');
    expect(panel.querySelector('a')?.href).toBe(
      'https://learn.microsoft.com/en-us/azure/governance/resource-graph/reference/supported-tables-resources'
    );
    expect(app.resourceGraphQuery).toBe('Resources | limit 10');
    expect(executeQuery).not.toHaveBeenCalled();

    panel.querySelector<HTMLButtonElement>('[popovertargetaction="hide"]')!.click();
    expect(panel.matches(':popover-open')).toBeFalse();
  });

  it('removes the table overlay when the Resource Graph dialog closes', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    app.resourceGraphDialogOpen = true;
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('.resource-graph-tables-button')!.click();
    app.closeResourceGraphDialog();
    fixture.detectChanges();
    expect(element.querySelector('#resource-graph-tables')).toBeNull();

    app.resourceGraphDialogOpen = true;
    fixture.detectChanges();
    expect(element.querySelector('#resource-graph-tables')?.matches(':popover-open')).toBeFalse();
  });

  it('adds Resource Graph rows to the shared resource selection', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const graphRow = {
      id: '/subscriptions/test/resourceGroups/example/providers/Microsoft.Storage/storageAccounts/store',
      name: 'store',
      type: 'Microsoft.Storage/storageAccounts',
      resourceGroup: 'example'
    };

    const resource = app.toSelectedAzureResource(graphRow);
    expect(resource).toEqual({
      id: graphRow.id,
      name: graphRow.name,
      type: graphRow.type,
      resourceGroup: graphRow.resourceGroup
    });

    if (!resource) {
      fail('Expected a selectable Azure resource');
      return;
    }

    app.addToSelection(resource);
    expect(TestBed.inject(ResourceSelectionService).selectedResources).toEqual([resource]);
  });

  it('does not make incomplete Resource Graph rows selectable', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    expect(app.toSelectedAzureResource({ id: 'resource-id', name: 'resource' })).toBeNull();
    expect(app.toSelectedAzureResource(null)).toBeNull();
  });

  it('includes Resource Graph error detail messages in the query error', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const error = Object.assign(new Error('HTTP 400 Bad Request'), {
      error: {
        code: 'BadRequest',
        details: [
          {
            code: 'DisallowedLogicalTableName',
            message: 'Table Resourcsses is invalid, unsupported or disallowed.'
          }
        ]
      }
    });
    spyOn(TestBed.inject(ResourceGraphService), 'executeQuery')
      .and.returnValue(throwError(() => error));

    app.runResourceGraphQuery();

    expect(app.resourceGraphQueryError).toBe(
      'HTTP 400 Bad Request\n- Table Resourcsses is invalid, unsupported or disallowed.'
    );
    expect(app.resourceGraphQueryLoading).toBeFalse();
  });

  it('renders projected and aggregate columns in response order without resource actions', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const result: ResourceGraphQueryResult = {
      columns: [{ name: 'location', type: 'string' }, { name: 'count_', type: 'long' }],
      rows: [{ location: 'northeurope', count_: 0 }],
      totalRecords: 1,
      resultTruncated: 'false'
    };
    spyOn(TestBed.inject(ResourceGraphService), 'executeQuery').and.returnValue(of(result));
    app.resourceGraphDialogOpen = true;

    app.runResourceGraphQuery();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(Array.from(element.querySelectorAll('th')).map((cell) => cell.textContent?.trim()))
      .toEqual(['location', 'count_']);
    expect(element.querySelector('.resource-graph-row')?.textContent).toContain('northeurope');
    expect(element.querySelector('.resource-graph-row')?.textContent).toContain('0');
    expect(element.querySelector('.add-all-resources-button')).toBeNull();
    expect(element.querySelector('.resource-graph-json-row')).toBeNull();

    element.querySelector<HTMLTableRowElement>('.resource-graph-row')!.click();
    fixture.detectChanges();
    expect(element.querySelector('pre')?.textContent).toBe(JSON.stringify(result.rows[0], null, 2));

    expect(element.querySelector('.resource-graph-json-row td')?.getAttribute('colspan')).toBe('2');
    element.querySelector<HTMLTableRowElement>('.resource-graph-row')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(element.querySelector('.resource-graph-json-row')).toBeNull();
  });

  it('limits wide results to eight columns and allows hidden columns to be shown', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const names = ['id', 'properties', 'tags', 'name', 'type', 'resourceGroup', 'location',
      'subscriptionId', 'kind', 'custom', 'name1'];
    const result: ResourceGraphQueryResult = {
      columns: names.map((name) => ({
        name,
        type: ['properties', 'tags'].includes(name) ? 'dynamic' : 'string'
      })),
      rows: [Object.fromEntries(names.map((name) => [
        name, ['properties', 'tags'].includes(name) ? { nested: true } : name
      ]))],
      totalRecords: 50,
      resultTruncated: 'true',
      $skipToken: 'next'
    };
    spyOn(TestBed.inject(ResourceGraphService), 'executeQuery').and.returnValue(of(result));
    app.resourceGraphDialogOpen = true;
    app.runResourceGraphQuery();
    fixture.detectChanges();

    expect(app.resourceGraphVisibleColumns).toEqual([
      'name', 'type', 'resourceGroup', 'location', 'id', 'subscriptionId', 'kind', 'custom'
    ]);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.resource-graph-result-count')?.textContent)
      .toContain('Showing 1 of 50 results.');
    expect(element.querySelector('.resource-graph-result-count')?.textContent)
      .toContain('Results are incomplete.');
    const checkbox = element.querySelectorAll<HTMLInputElement>('.resource-graph-columns input')[10];
    checkbox.click();
    fixture.detectChanges();
    expect(app.resourceGraphVisibleColumns).toContain('name1');
    expect(app.resourceGraphVisibleColumns.slice(0, 4))
      .toEqual(['name', 'type', 'resourceGroup', 'location']);
    expect(element.querySelectorAll('th').length).toBe(10);

    element.querySelector<HTMLButtonElement>('.add-resource-button')!.click();
    fixture.detectChanges();
    expect(app.expandedResourceGraphRows.size).toBe(0);
    expect(TestBed.inject(ResourceSelectionService).selectedResources.length).toBe(1);

    app.toggleResourceGraphRow(0);
    app.runResourceGraphQuery();
    expect(app.expandedResourceGraphRows.size).toBe(0);
    expect(app.resourceGraphVisibleColumns.length).toBe(8);
  });

  it('keeps at least one column visible and formats structured and missing cell values', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    spyOn(TestBed.inject(ResourceGraphService), 'executeQuery').and.returnValue(of({
      columns: [{ name: 'count_', type: 'long' }],
      rows: [{ count_: 3 }],
      totalRecords: 1,
      resultTruncated: 'false'
    }));
    app.runResourceGraphQuery();
    app.toggleResourceGraphColumn('count_');

    expect(app.resourceGraphVisibleColumns).toEqual(['count_']);
    expect(app.resourceGraphCell(null)).toBe('\u2014');
    expect(app.resourceGraphCell(undefined)).toBe('\u2014');
    expect(app.resourceGraphCell(false)).toBe('false');
    expect(app.resourceGraphCell(0)).toBe('0');
    expect(app.resourceGraphCell({ nested: true })).toBe('{...}');
    expect(app.resourceGraphCell(['one', 'two'])).toBe('2 items');
  });

  it('renders heterogeneous rows without requiring resource identifiers', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    spyOn(TestBed.inject(ResourceGraphService), 'executeQuery').and.returnValue(of({
      columns: [
        { name: 'name1', type: 'string' },
        { name: 'state', type: 'string' },
        { name: 'properties', type: 'dynamic' }
      ],
      rows: [
        { name1: 'policy', state: null, properties: { enabled: true } },
        { name1: null, state: 'Compliant', properties: ['one', 'two'] }
      ],
      totalRecords: 2,
      resultTruncated: 'false'
    }));
    app.resourceGraphDialogOpen = true;
    app.runResourceGraphQuery();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const rows = element.querySelectorAll('.resource-graph-row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('{...}');
    expect(rows[0].textContent).toContain('\u2014');
    expect(rows[1].textContent).toContain('2 items');
    expect(element.querySelector('.add-resource-button')).toBeNull();
    expect(element.querySelector('.resource-graph-result-count')?.textContent)
      .not.toContain('incomplete');
  });

  it('shows an empty state instead of a table when a query returns no rows', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    spyOn(TestBed.inject(ResourceGraphService), 'executeQuery').and.returnValue(of({
      columns: [{ name: 'name', type: 'string' }],
      rows: [],
      totalRecords: 0,
      resultTruncated: 'false'
    }));
    app.resourceGraphDialogOpen = true;
    app.runResourceGraphQuery();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.resource-graph-results')?.textContent).toContain('No results.');
    expect(element.querySelector('.resource-graph-table')).toBeNull();
  });

  it('adds all selectable Resource Graph results to the shared selection', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    app.resourceGraphResults = [
      {
        id: '/subscriptions/test/resourceGroups/one/providers/Microsoft.Storage/storageAccounts/one',
        name: 'one',
        type: 'Microsoft.Storage/storageAccounts',
        resourceGroup: 'one'
      },
      { id: 'incomplete-resource', name: 'incomplete' },
      {
        id: '/subscriptions/test/resourceGroups/two/providers/Microsoft.Compute/virtualMachines/two',
        name: 'two',
        type: 'Microsoft.Compute/virtualMachines',
        resourceGroup: 'two'
      }
    ];

    app.addAllResultsToSelection();

    expect(TestBed.inject(ResourceSelectionService).selectedResources).toEqual([
      {
        id: '/subscriptions/test/resourceGroups/one/providers/Microsoft.Storage/storageAccounts/one',
        name: 'one',
        type: 'Microsoft.Storage/storageAccounts',
        resourceGroup: 'one'
      },
      {
        id: '/subscriptions/test/resourceGroups/two/providers/Microsoft.Compute/virtualMachines/two',
        name: 'two',
        type: 'Microsoft.Compute/virtualMachines',
        resourceGroup: 'two'
      }
    ]);
  });

  it('saves, selects and deletes named Resource Graph queries', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const storage = window.localStorage;
    spyOn(storage, 'setItem').and.callThrough();
    app.resourceGraphQueryName = 'Storage resources';
    app.resourceGraphQuery = "Resources | where type contains 'storage'";

    app.saveResourceGraphQuery();

    expect(app.savedResourceGraphQueries).toEqual([{
      name: 'Storage resources',
      query: "Resources | where type contains 'storage'"
    }]);
    expect(app.selectedSavedResourceGraphQueryName).toBe('Storage resources');
    expect(storage.setItem).toHaveBeenCalledWith(
      'azome.savedResourceGraphQueries',
      JSON.stringify(app.savedResourceGraphQueries)
    );

    app.resourceGraphQuery = 'Resources | limit 1';
    const select = document.createElement('select');
    select.add(new Option('Storage resources', 'Storage resources'));
    select.value = 'Storage resources';
    const changeEvent = new Event('change');
    select.dispatchEvent(changeEvent);
    app.selectSavedResourceGraphQuery(changeEvent);
    expect(app.resourceGraphQuery).toBe("Resources | where type contains 'storage'");

    app.deleteSavedResourceGraphQuery();
    expect(app.savedResourceGraphQueries).toEqual([]);
    expect(app.selectedSavedResourceGraphQueryName).toBe('');
  });

  it('shows the selected saved query in the Resource Graph editor', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    app.resourceGraphDialogOpen = true;
    app.resourceGraphQuery = "resources | where type contains 'storage'";
    fixture.detectChanges();
    await fixture.debugElement.query(By.directive(QueryEditorComponent))
      .componentInstance.whenReady();

    const element = fixture.nativeElement as HTMLElement;
    const content = element.querySelector('#resource-graph-query');
    expect(content?.textContent).toBe("resources | where type contains 'storage'");
    expect(element.querySelector('.resource-graph-query-form textarea')).toBeNull();
  });

  it('scrolls long queries while reserving space for query results', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    app.resourceGraphDialogOpen = true;
    app.resourceGraphQuery = ['Resources', ...Array(60).fill('| extend example = name')].join('\n');
    app.resourceGraphResults = [];
    fixture.detectChanges();
    await fixture.debugElement.query(By.directive(QueryEditorComponent))
      .componentInstance.whenReady();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const editor = element.querySelector<HTMLElement>('app-query-editor')!;
    const results = element.querySelector<HTMLElement>('.resource-graph-results')!;
    expect(editor.getBoundingClientRect().height).toBeLessThanOrEqual(181);
    expect(editor.scrollHeight).toBeGreaterThan(editor.clientHeight);
    expect(getComputedStyle(editor).overflowY).toBe('auto');
    expect(results.getBoundingClientRect().height)
      .toBeGreaterThanOrEqual(Math.min(window.innerHeight * 0.25, 200) - 1);
  });

  it('resets the query and name when the saved query placeholder is selected', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    app.savedResourceGraphQueries = [{
      name: 'Previously saved',
      query: 'Resources | limit 1'
    }];
    app.selectedSavedResourceGraphQueryName = 'Previously saved';
    app.resourceGraphQueryName = 'Previously saved';
    app.resourceGraphQuery = 'Resources | limit 1';
    app.resourceGraphResults = [{ name: 'old result' }];

    const select = document.createElement('select');
    select.add(new Option('Select a saved query', ''));
    select.value = '';
    const changeEvent = new Event('change');
    select.dispatchEvent(changeEvent);
    app.selectSavedResourceGraphQuery(changeEvent);

    expect(app.selectedSavedResourceGraphQueryName).toBe('');
    expect(app.resourceGraphQueryName).toBe('');
    expect(app.resourceGraphQuery).toBe('Resources | limit 10');
    expect(app.resourceGraphResults).toBeNull();
  });

  it('opens Resource Graph with no saved query selected or suggested name', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    app.savedResourceGraphQueries = [{
      name: 'Previously saved',
      query: 'Resources | limit 1'
    }];
    app.selectedSavedResourceGraphQueryName = 'Previously saved';
    app.resourceGraphQueryName = 'Previously saved';

    app.openResourceGraphDialog(document.createElement('details'));

    expect(app.resourceGraphDialogOpen).toBeTrue();
    expect(app.selectedSavedResourceGraphQueryName).toBe('');
    expect(app.resourceGraphQueryName).toBe('');
    expect(app.resourceGraphQuery).toBe('Resources | limit 10');
  });

  it('loads saved perspective order and visibility from local storage', () => {
    window.localStorage.setItem('azome.perspectivePreferences', JSON.stringify([
      { id: 'data', visible: true },
      { id: 'resources', visible: false }
    ]));
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    app.ngOnInit();

    expect(app.visiblePerspectives.map((perspective) => perspective.id)).toEqual([
      'data',
      'networking',
      'monitoring',
      'app'
    ]);
    expect(app.perspectives[0].id).toBe('data');
    expect(app.perspectives.find((perspective) => perspective.id === 'resources')?.visible)
      .toBeFalse();
  });

  it('persists perspective preference changes and switches away from hidden current view', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const preferences = DEFAULT_PERSPECTIVES.map((preference) => ({
      ...preference,
      visible: preference.id !== 'networking'
    }));
    app.selectedPerspective = 'networking';

    app.updatePerspectivePreferences(preferences);

    expect(JSON.parse(window.localStorage.getItem('azome.perspectivePreferences') ?? '[]'))
      .toEqual(preferences);
    expect(app.selectedPerspective).toBe('resources');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/rg');
  });

});
