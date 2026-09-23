import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { 
  NetworkTopology, 
  ResourceGraphService, 
  AzureResourceDetail,
  NetworkSubnet
} from '../../services/azure/resource-graph.service';
import { NetworkGraphComponent } from './network-graph.component';
import { SubnetNavigation } from './network-graph.model';
import { DetailsPanelComponent } from '../../components/details-panel/details-panel.component';
import { ResourceDetailHostComponent } from '../../components/resource-details/resource-detail-host.component';
import { ResourceDetailRegistryService, PanelVariant } from '../../services/azome/resource-detail.registry';

@Component({
  selector: 'app-networking-perspective',
  standalone: true,
  imports: [
    CommonModule, 
    NetworkGraphComponent, 
    DetailsPanelComponent, 
    ResourceDetailHostComponent
  ],
  templateUrl: './networking-perspective.component.html',
  styleUrl: './networking-perspective.component.scss'
})
export class NetworkingPerspectiveComponent implements OnInit, OnDestroy {
  public topologies: NetworkTopology[] = [];
  public loading = false;
  public error: string | null = null;
  public viewMode: 'list' | 'graph' = 'list';

  public selectedResource: AzureResourceDetail | null = null;
  public loadingDetails = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private resourceGraph: ResourceGraphService,
    private registryService: ResourceDetailRegistryService
  ) {}

  ngOnInit(): void {
    this.loadTopologies();
  }

  onGraphResourceSelect(resourceId: string): void {
    this.openResourceDetails(resourceId);
  }

  /**
   * ARM Top-level resources (NSG, Route Table)
   * Fetches full resource JSON via Azure Resource Graph API.
   */
  public openResourceDetails(resourceId: string | null | undefined, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!resourceId) return;

    this.loadingDetails = true;
    this.resourceGraph.getResourceDetails(resourceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (details) => {
          if (details) {
            this.selectedResource = details;
          }
          this.loadingDetails = false;
        },
        error: (err) => {
          console.error('Failed to fetch resource details:', err);
          this.loadingDetails = false;
        }
      });
  }



  public get detailPanelVariant(): PanelVariant {
    if (!this.selectedResource?.type) return 'default';
    const componentClass = this.registryService.getComponent(this.selectedResource.type);
    return componentClass?.preferredVariant || 'default';
  }

  public getShortType(fullType: string): string {
    if (!fullType) return 'Resource';
    const parts = fullType.split('/');
    return parts[parts.length - 1] || fullType;
  }

  public loadTopologies(): void {
    this.loading = true;
    this.error = null;

    this.resourceGraph.getNetworkTopologies()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (topologies) => {
          this.topologies = topologies;
          this.loading = false;
        },
        error: (error) => {
          console.error('Failed to load network topology:', error);
          this.error = error.message || 'Azure Resource Graph did not return the network topology.';
          this.loading = false;
        }
      });
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

}