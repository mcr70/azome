import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ResourceDetailPaneComponent } from '../../components/resources/resource-detail-pane.component';
import { ResourceCardComponent } from '../../components/resource-card.component';
import { DataBrowsePaneComponent } from './data-browse-pane.component';
import { AzureDataResource, DataResourceCategory } from '../../services/azure/data.model';
import {
  AzureResourceDetail,
  ResourceGraphService
} from '../../services/azure/resource-graph.service';
import {
  ResourceDetailPanelService,
  ResourcePanelConfig
} from '../../services/azome/resource-detail-panel.service';

interface DataResourceTypeGroup {
  type: string;
  label: string;
  resources: AzureDataResource[];
}

interface DataResourceCategoryGroup {
  category: DataResourceCategory;
  types: DataResourceTypeGroup[];
}

@Component({
  selector: 'app-data-perspective',
  standalone: true,
  imports: [
    CommonModule,
    ResourceDetailPaneComponent,
    ResourceCardComponent,
    DataBrowsePaneComponent
  ],
  templateUrl: './data-perspective.component.html',
  styleUrl: './data-perspective.component.scss'
})
export class DataPerspectiveComponent implements OnInit, OnDestroy {
  public resources: AzureDataResource[] = [];
  public loading = false;
  public loadingDetails = false;
  public error: string | null = null;
  public panels: ResourcePanelConfig[] = [];
  public browseResource: AzureResourceDetail | null = null;

  private readonly destroy$ = new Subject<void>();
  private detailRequestId = 0;

  constructor(
    private readonly resourceGraph: ResourceGraphService,
    private readonly panelService: ResourceDetailPanelService
  ) {
  }

  public get categoryGroups(): DataResourceCategoryGroup[] {
    const categories = new Map<DataResourceCategory, Map<string, AzureDataResource[]>>();

    for (const resource of this.resources) {
      const category = resource.category;
      const categoryTypes = categories.get(category) ?? new Map<string, AzureDataResource[]>();
      const resourceType = resource.type.toLowerCase();
      const typeResources = categoryTypes.get(resourceType) ?? [];

      typeResources.push(resource);
      categoryTypes.set(resourceType, typeResources);
      categories.set(category, categoryTypes);
    }

    return Array.from(categories.entries())
      .sort(([categoryA], [categoryB]) => categoryA.localeCompare(categoryB))
      .map(([category, types]) => ({
        category,
        types: Array.from(types.entries())
          .sort(([typeA], [typeB]) => typeA.localeCompare(typeB))
          .map(([type, resources]) => ({
            type,
            label: this.resourceTypeLabel(type),
            resources
          }))
      }));
  }

  public get pinnedPanels(): ResourcePanelConfig[] {
    return this.panels.filter((panel) => panel.pinned);
  }

  public get floatingPanel(): ResourcePanelConfig | null {
    return this.panels.find((panel) => !panel.pinned) ?? null;
  }

  ngOnInit(): void {
    this.loadResources();
    this.panelService.panels$
      .pipe(takeUntil(this.destroy$))
      .subscribe((panels) => this.panels = panels);
  }

  public loadResources(): void {
    this.loading = true;
    this.error = null;

    this.resourceGraph.getDataResources()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resources) => {
          this.resources = resources;
          this.loading = false;
        },
        error: (error: unknown) => {
          console.error('Failed to load data resources:', error);
          this.error = 'Data resources could not be loaded. Check your subscription access and try again.';
          this.loading = false;
        }
      });
  }

  public openResourceDetails(resourceId: string, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    const requestId = ++this.detailRequestId;
    this.loadingDetails = true;
    this.resourceGraph.getResourceDetails(resourceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (details) => {
          if (requestId !== this.detailRequestId) {
            return;
          }

          if (details) {
            this.panelService.openPanel(details);
          }
          this.loadingDetails = false;
        },
        error: (error: unknown) => {
          if (requestId !== this.detailRequestId) {
            return;
          }

          console.error('Failed to fetch resource details:', error);
          this.loadingDetails = false;
        }
      });
  }

  public isBrowsable(resource: AzureDataResource): boolean {
    const type = resource.type.toLowerCase();
    return type === 'microsoft.storage/storageaccounts'
      || type === 'microsoft.documentdb/databaseaccounts';
  }

  public openBrowse(resource: AzureDataResource, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.resourceGraph.getResourceDetails(resource.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (details) => {
          if (details) this.browseResource = details;
        },
        error: (error: unknown) => console.error('Failed to open data browser:', error)
      });
  }

  public resourceTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      'microsoft.storage/storageaccounts': 'Storage accounts',
      'microsoft.documentdb/databaseaccounts': 'Cosmos DB accounts',
      'microsoft.dbforpostgresql/flexibleservers': 'PostgreSQL flexible servers',
      'microsoft.dbformysql/flexibleservers': 'MySQL flexible servers',
      'microsoft.sql/servers': 'SQL servers',
      'microsoft.sql/servers/databases': 'SQL databases',
      'microsoft.cache/redis': 'Redis caches',
      'microsoft.servicebus/namespaces': 'Service Bus namespaces',
      'microsoft.eventhub/namespaces': 'Event Hubs namespaces'
    };

    return labels[type.toLowerCase()] ?? type.split('/').pop() ?? type;
  }

  public closePanel(panelId: string): void {
    this.panelService.closePanel(panelId);
  }

  public closeBrowse(): void {
    this.browseResource = null;
  }

  public togglePanelPin(panelId: string): void {
    this.panelService.togglePin(panelId);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
