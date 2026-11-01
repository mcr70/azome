import { Component, OnDestroy, OnInit } from '@angular/core';

import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  NetworkTopology,
  ResourceGraphService
} from '@services/azure/resource-graph.service';
import { NetworkGraphComponent } from './network-graph.component';
import { ResourceDetailPaneComponent } from '@components/resources/resource-detail-pane.component';
import { ResourceDetailPanelService, ResourcePanelConfig } from '@services/azome/resource-detail-panel.service';
import { ResourceTypeIconComponent } from '@components/resource-card/resource-type-icon.component';
import { ResourceCardComponent } from '@components/resource-card/resource-card.component';
import { ResourceGridSelectionComponent } from '@components/resource-grid-selection/resource-grid-selection.component';
import { TextFilterComponent } from '@components/text-filter/text-filter.component';
import { ResourceSelectionBarComponent } from '@components/resource-selection-bar.component';
import { matchesTextFilter } from '@app/utils/text-filter';
import { SelectedAzureResource } from '@services/azome/resource-selection.service';
import {
  selectFloatingPanel,
  selectPinnedPanels,
  shortResourceTypeName
} from '../perspective-utils';

/**
 * Networking perspective.
 *
 * Shows the virtual network topologies of the subscription either as a card
 * list or as an interactive graph, including subnets, peerings, and the
 * attached network security groups and route tables.
 */
@Component({
  selector: 'app-networking-perspective',
  standalone: true,
  imports: [
    NetworkGraphComponent,
    ResourceDetailPaneComponent,
    ResourceTypeIconComponent,
    ResourceCardComponent,
    ResourceGridSelectionComponent,
    TextFilterComponent,
    ResourceSelectionBarComponent
  ],
  templateUrl: './networking-perspective.component.html',
  styleUrls: ['../perspective-shared.scss', './networking-perspective.component.scss']
})
export class NetworkingPerspectiveComponent implements OnInit, OnDestroy {
  public topologies: NetworkTopology[] = [];
  public filteredTopologies: NetworkTopology[] = [];
  public loading = false;
  public error: string | null = null;
  public viewMode: 'list' | 'graph' = 'list';
  public filterQuery = '';
  public loadingDetails = false;
  public panels: ResourcePanelConfig[] = [];

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly resourceGraph: ResourceGraphService,
    private readonly panelService: ResourceDetailPanelService
  ) {}

  /** Loads the network topologies and mirrors the shared panel state. */
  public ngOnInit(): void {
    this.loadTopologies();
    this.panelService.panels$
      .pipe(takeUntil(this.destroy$))
      .subscribe((panels) => this.panels = panels);
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Panels pinned into the side-by-side slots. */
  public get pinnedPanels(): ResourcePanelConfig[] {
    return selectPinnedPanels(this.panels);
  }

  /** The floating resource details panel, if one is open. */
  public get floatingPanel(): ResourcePanelConfig | null {
    return selectFloatingPanel(this.panels);
  }

  /**
   * Opens resource details for a node selected in the network graph.
   *
   * @param resourceId ARM resource ID of the selected graph node.
   */
  public onGraphResourceSelect(resourceId: string): void {
    this.openResourceDetails(resourceId);
  }

  /**
   * Opens the resource details panel for an ARM top-level resource such as a
   * network security group or a route table. The full resource JSON is
   * fetched via the Azure Resource Graph API.
   *
   * @param resourceId ARM resource ID; ignored when empty (unassigned NSG/route table).
   * @param event Optional click event; prevented to keep the card selection.
   */
  public openResourceDetails(resourceId: string | null | undefined, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!resourceId) {
      return;
    }

    this.loadingDetails = true;
    this.resourceGraph.getResourceDetails(resourceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (details) => {
          if (details) {
            this.panelService.openPanel(details);
          }
          this.loadingDetails = false;
        },
        error: (err) => {
          console.error('Failed to fetch resource details:', err);
          this.loadingDetails = false;
        }
      });
  }

  /**
   * Applies a new text filter to the topology list.
   *
   * @param query Filter text entered by the user.
   */
  public onFilterChange(query: string): void {
    this.filterQuery = query;
    this.updateFilteredTopologies();
  }

  /**
   * Returns the short display name of a full resource type.
   *
   * @param fullType Full Azure resource type.
   * @returns The last type segment, or "Resource" when the type is empty.
   */
  public getShortType(fullType: string): string {
    return shortResourceTypeName(fullType);
  }

  /**
   * Builds the ARM resource ID of a subnet.
   *
   * @param topologyId Virtual network resource ID.
   * @param subnetName Subnet name inside the virtual network.
   * @returns The subnet resource ID.
   */
  public subnetResourceId(topologyId: string, subnetName: string): string {
    return `${topologyId}/subnets/${subnetName}`;
  }

  /**
   * Maps the subnets of a virtual network into selectable resources for the
   * subnet grid selection.
   *
   * @param topology Virtual network topology.
   * @returns Selection entries for every subnet of the network.
   */
  public subnetSelectionResources(topology: NetworkTopology): SelectedAzureResource[] {
    return topology.subnets.map((subnet) => ({
      id: this.subnetResourceId(topology.id, subnet.name),
      type: 'Microsoft.Network/virtualNetworks/subnets',
      name: subnet.name,
      resourceGroup: topology.resourceGroup
    }));
  }

  /**
   * Closes a resource details panel.
   *
   * @param panelId Identifier of the panel to close.
   */
  public closePanel(panelId: string): void {
    this.panelService.closePanel(panelId);
  }

  /**
   * Changes the pinned state of a resource details panel.
   *
   * @param panelId Identifier of the panel to pin or unpin.
   */
  public togglePanelPin(panelId: string): void {
    this.panelService.togglePin(panelId);
  }

  /** Loads the virtual network topologies of the configured subscription. */
  public loadTopologies(): void {
    this.loading = true;
    this.error = null;

    this.resourceGraph.getNetworkTopologies()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (topologies) => {
          this.topologies = topologies;
          this.updateFilteredTopologies();
          this.loading = false;
        },
        error: (error) => {
          console.error('Failed to load network topology:', error);
          this.error = error.message || 'Azure Resource Graph did not return the network topology.';
          this.loading = false;
        }
      });
  }

  /**
   * Recomputes the filtered topology list. A network stays visible when the
   * network itself matches or when at least one of its subnets matches; only
   * the matching subnets of a network are shown.
   */
  private updateFilteredTopologies(): void {
    if (!this.filterQuery.trim()) {
      this.filteredTopologies = this.topologies;
      return;
    }

    this.filteredTopologies = this.topologies
      .map((topology) => ({
        ...topology,
        subnets: topology.subnets.filter((subnet) =>
          matchesTextFilter(
            this.filterQuery,
            topology.resourceGroup,
            topology.name,
            subnet.name,
            subnet.networkSecurityGroupName,
            subnet.routeTableName
          )
        )
      }))
      .filter((topology) =>
        matchesTextFilter(this.filterQuery, topology.resourceGroup, topology.name)
        || topology.subnets.length > 0
      );
  }
}
