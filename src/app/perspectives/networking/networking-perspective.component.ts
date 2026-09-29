import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { 
  NetworkTopology, 
  ResourceGraphService, 
} from '../../services/azure/resource-graph.service';
import { NetworkGraphComponent } from './network-graph.component';
import { ResourceDetailPaneComponent } from '../../components/resources/resource-detail-pane.component';
import { ResourceDetailPanelService, ResourcePanelConfig } from '../../services/azome/resource-detail-panel.service';

@Component({
  selector: 'app-networking-perspective',
  standalone: true,
  imports: [
    CommonModule, 
    NetworkGraphComponent, 
    ResourceDetailPaneComponent
  ],
  templateUrl: './networking-perspective.component.html',
  styleUrl: './networking-perspective.component.scss'
})
export class NetworkingPerspectiveComponent implements OnInit, OnDestroy {
  public topologies: NetworkTopology[] = [];
  public loading = false;
  public error: string | null = null;
  public viewMode: 'list' | 'graph' = 'list';

  public loadingDetails = false;
  public panels: ResourcePanelConfig[] = [];

  private readonly destroy$ = new Subject<void>();

  constructor(
    private resourceGraph: ResourceGraphService,
    private panelService: ResourceDetailPanelService
  ) {}

  ngOnInit(): void {
    this.loadTopologies();
    this.panelService.panels$.pipe(takeUntil(this.destroy$)).subscribe((panels) => this.panels = panels);
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



  public get pinnedPanels(): ResourcePanelConfig[] {
    return this.panels.filter((panel) => panel.pinned);
  }

  public get floatingPanel(): ResourcePanelConfig | null {
    return this.panels.find((panel) => !panel.pinned) ?? null;
  }

  public get canDuplicatePanel(): boolean {
    return this.panels.length < 2;
  }

  public getShortType(fullType: string): string {
    if (!fullType) return 'Resource';
    const parts = fullType.split('/');
    return parts[parts.length - 1] || fullType;
  }

  public closePanel(panelId: string): void { this.panelService.closePanel(panelId); }
  public togglePanelPin(panelId: string): void { this.panelService.togglePin(panelId); }
  public duplicatePanel(panelId: string): void { this.panelService.duplicatePanel(panelId); }

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
