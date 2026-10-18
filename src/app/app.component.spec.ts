import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { AuthService } from './services/azome/auth.service';
import { ResourceSelectionService } from './services/azome/resource-selection.service';
import { ProfileService } from './services/azure/profile.service';
import { ResourceGraphService } from './services/azure/resource-graph.service';
import { Router } from '@angular/router';
import { EMPTY } from 'rxjs';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: AuthService, useValue: { isAuthenticated$: EMPTY, user$: EMPTY } },
        { provide: ProfileService, useValue: { getMyProfile: () => EMPTY } },
        { provide: ResourceGraphService, useValue: { executeQuery: () => EMPTY } },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
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

});
