import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { AzureDataResource } from '@services/azure/data.model';
import {
  AzureResourceDetail,
  ResourceGraphService
} from '@services/azure/resource-graph.service';
import { ResourceDetailPanelService } from '@services/azome/resource-detail-panel.service';
import { DataPerspectiveComponent } from './data-perspective.component';

describe('DataPerspectiveComponent', () => {
  let fixture: ComponentFixture<DataPerspectiveComponent>;
  let component: DataPerspectiveComponent;
  let graph: jasmine.SpyObj<ResourceGraphService>;
  let panels: jasmine.SpyObj<ResourceDetailPanelService>;
  const storage: AzureDataResource = {
    id: '/subscriptions/test/resourceGroups/production/providers/Microsoft.Storage/storageAccounts/orders',
    name: 'orders',
    resourceGroup: 'production',
    type: 'Microsoft.Storage/storageAccounts',
    category: 'Storage'
  };
  const cosmos: AzureDataResource = {
    id: '/subscriptions/test/resourceGroups/production/providers/Microsoft.DocumentDB/databaseAccounts/catalog',
    name: 'catalog',
    resourceGroup: 'production',
    type: 'Microsoft.DocumentDB/databaseAccounts',
    category: 'NoSQL'
  };
  const redis: AzureDataResource = {
    id: '/subscriptions/test/resourceGroups/production/providers/Microsoft.Cache/Redis/cache',
    name: 'cache',
    resourceGroup: 'production',
    type: 'Microsoft.Cache/redis',
    category: 'Cache'
  };
  const storageDetail: AzureResourceDetail = { ...storage, properties: {} };

  beforeEach(async () => {
    graph = jasmine.createSpyObj<ResourceGraphService>(
      'ResourceGraphService',
      ['getDataResources', 'getResourceDetails']
    );
    graph.getDataResources.and.returnValue(of([storage, cosmos, redis]));
    graph.getResourceDetails.and.returnValue(of(storageDetail));
    panels = jasmine.createSpyObj<ResourceDetailPanelService>(
      'ResourceDetailPanelService',
      ['openPanel', 'closePanel', 'togglePin'],
      { panels$: of([]) }
    );

    await TestBed.configureTestingModule({
      imports: [DataPerspectiveComponent],
      providers: [
        { provide: ResourceGraphService, useValue: graph },
        { provide: ResourceDetailPanelService, useValue: panels }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(DataPerspectiveComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('groups resources into sorted categories with friendly type labels', () => {
    const groups = component.categoryGroups;

    expect(groups.map((group) => group.category)).toEqual(['Cache', 'NoSQL', 'Storage']);
    expect(groups[2].types).toEqual([{
      type: 'microsoft.storage/storageaccounts',
      label: 'Storage accounts',
      resources: [storage]
    }]);
  });

  it('filters resources by resource group and name', () => {
    component.filterQuery = 'catalog';
    expect(component.filteredResources).toEqual([cosmos]);
    expect(component.categoryGroups.map((group) => group.category)).toEqual(['NoSQL']);

    component.filterQuery = '';
    expect(component.filteredResources.length).toBe(3);
  });

  it('marks only storage and Cosmos DB accounts as browsable', () => {
    expect(component.isBrowsable(storage)).toBeTrue();
    expect(component.isBrowsable(cosmos)).toBeTrue();
    expect(component.isBrowsable(redis)).toBeFalse();
  });

  it('opens and closes the data browser for a resource', () => {
    const event = new Event('click');
    component.openBrowse(storage, event);

    expect(graph.getResourceDetails).toHaveBeenCalledWith(storage.id);
    expect(component.browseResource).toEqual(storageDetail);

    component.closeBrowse();
    expect(component.browseResource).toBeNull();
  });

  it('opens resource details in a panel and ignores stale responses', () => {
    const firstResponse = new Subject<AzureResourceDetail | null>();
    graph.getResourceDetails.and.returnValue(firstResponse);
    component.openResourceDetails(storage.id);

    // A second click supersedes the first request before it resolves.
    graph.getResourceDetails.and.returnValue(of({ ...cosmos, properties: {} }));
    component.openResourceDetails(cosmos.id);
    expect(panels.openPanel).toHaveBeenCalledTimes(1);

    firstResponse.next(storageDetail);
    firstResponse.complete();
    expect(panels.openPanel).toHaveBeenCalledTimes(1);
    expect(component.loadingDetails).toBeFalse();
  });

  it('shows an error when loading data resources fails', () => {
    spyOn(console, 'error');
    graph.getDataResources.and.returnValue(throwError(() => new Error('boom')));
    component.loadResources();

    expect(component.error).toContain('Data resources could not be loaded');
    expect(component.loading).toBeFalse();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.error-message')).not.toBeNull();
  });
});
