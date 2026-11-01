import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import {
  NetworkTopology,
  ResourceGraphService
} from '@services/azure/resource-graph.service';
import { ResourceDetailPanelService } from '@services/azome/resource-detail-panel.service';
import { NetworkingPerspectiveComponent } from './networking-perspective.component';

describe('NetworkingPerspectiveComponent', () => {
  let fixture: ComponentFixture<NetworkingPerspectiveComponent>;
  let component: NetworkingPerspectiveComponent;
  let graph: jasmine.SpyObj<ResourceGraphService>;
  let panels: jasmine.SpyObj<ResourceDetailPanelService>;
  const hubVnet: NetworkTopology = {
    id: '/subscriptions/test/resourceGroups/network/providers/Microsoft.Network/virtualNetworks/hub',
    name: 'hub',
    resourceGroup: 'network',
    location: 'westeurope',
    addressPrefixes: ['10.0.0.0/16'],
    subnets: [
      {
        name: 'frontend',
        addressPrefixes: ['10.0.1.0/24'],
        networkSecurityGroupId: '/nsg/frontend',
        networkSecurityGroupName: 'frontend-nsg',
        routeTableId: null,
        routeTableName: null
      },
      {
        name: 'backend',
        addressPrefixes: ['10.0.2.0/24'],
        networkSecurityGroupId: null,
        networkSecurityGroupName: null,
        routeTableId: null,
        routeTableName: null
      }
    ],
    peerings: []
  };
  const spokeVnet: NetworkTopology = {
    ...hubVnet,
    id: '/subscriptions/test/resourceGroups/apps/providers/Microsoft.Network/virtualNetworks/spoke',
    name: 'spoke',
    resourceGroup: 'apps',
    subnets: []
  };

  beforeEach(async () => {
    graph = jasmine.createSpyObj<ResourceGraphService>(
      'ResourceGraphService',
      ['getNetworkTopologies', 'getResourceDetails']
    );
    graph.getNetworkTopologies.and.returnValue(of([hubVnet, spokeVnet]));
    graph.getResourceDetails.and.returnValue(of({
      id: '/nsg/frontend',
      name: 'frontend-nsg',
      type: 'Microsoft.Network/networkSecurityGroups'
    }));
    panels = jasmine.createSpyObj<ResourceDetailPanelService>(
      'ResourceDetailPanelService',
      ['openPanel', 'closePanel', 'togglePin'],
      { panels$: of([]) }
    );

    await TestBed.configureTestingModule({
      imports: [NetworkingPerspectiveComponent],
      providers: [
        provideRouter([]),
        { provide: ResourceGraphService, useValue: graph },
        { provide: ResourceDetailPanelService, useValue: panels }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(NetworkingPerspectiveComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the topologies into the list view by default', () => {
    expect(component.viewMode).toBe('list');
    expect(component.filteredTopologies).toEqual([hubVnet, spokeVnet]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('hub');
  });

  it('keeps a network visible when only one of its subnets matches the filter', () => {
    component.onFilterChange('frontend');

    expect(component.filteredTopologies.length).toBe(1);
    expect(component.filteredTopologies[0].name).toBe('hub');
    expect(component.filteredTopologies[0].subnets.map((subnet) => subnet.name))
      .toEqual(['frontend']);

    component.onFilterChange('');
    expect(component.filteredTopologies).toEqual([hubVnet, spokeVnet]);
  });

  it('opens resource details only for assigned resources', () => {
    component.openResourceDetails(null);
    component.openResourceDetails(undefined);
    expect(graph.getResourceDetails).not.toHaveBeenCalled();

    component.openResourceDetails('/nsg/frontend');
    expect(graph.getResourceDetails).toHaveBeenCalledWith('/nsg/frontend');
    expect(panels.openPanel).toHaveBeenCalled();
    expect(component.loadingDetails).toBeFalse();
  });

  it('maps subnets into selectable subnet resources', () => {
    expect(component.subnetSelectionResources(hubVnet)).toEqual([
      {
        id: `${hubVnet.id}/subnets/frontend`,
        type: 'Microsoft.Network/virtualNetworks/subnets',
        name: 'frontend',
        resourceGroup: 'network'
      },
      {
        id: `${hubVnet.id}/subnets/backend`,
        type: 'Microsoft.Network/virtualNetworks/subnets',
        name: 'backend',
        resourceGroup: 'network'
      }
    ]);
  });

  it('shows an error when the topology query fails', () => {
    spyOn(console, 'error');
    graph.getNetworkTopologies.and.returnValue(throwError(() => new Error('denied')));
    component.loadTopologies();

    expect(component.error).toBe('denied');
    expect(component.loading).toBeFalse();
  });
});
