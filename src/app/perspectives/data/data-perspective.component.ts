import { Component, OnDestroy, OnInit } from '@angular/core';
import { TextFilterComponent } from '@components/text-filter/text-filter.component';
import { ResourceSelectionBarComponent } from '@components/resource-selection-bar.component';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ResourceDetailPaneComponent } from '@components/resources/resource-detail-pane.component';
import { ResourceCardComponent } from '@components/resource-card/resource-card.component';
import { ResourceGridSelectionComponent } from '@components/resource-grid-selection/resource-grid-selection.component';
import { DataBrowsePaneComponent } from './data-browse-pane.component';
import { AzureDataResource, DataResourceCategory } from '@services/azure/data.model';
import {
  AzureResourceDetail,
  ResourceGraphService
} from '@services/azure/resource-graph.service';
import {
  ResourceDetailPanelService,
  ResourcePanelConfig
} from '@services/azome/resource-detail-panel.service';
import { matchesTextFilter } from '@app/utils/text-filter';
import {
  groupResourcesByCategory,
  PerspectiveResourceCategoryGroup
} from '../perspective-resource-groups';
import { selectFloatingPanel, selectPinnedPanels } from '../perspective-utils';

/**
 * Data perspective.
 *
 * Lists the data-plane oriented resources (storage, databases, messaging) by
 * category and provides the data Browse pane for supported resource types.
 */
@Component({
  selector: 'app-data-perspective',
  standalone: true,
  imports: [
    ResourceDetailPaneComponent,
    ResourceCardComponent,
    ResourceGridSelectionComponent,
    DataBrowsePaneComponent,
    TextFilterComponent,
    ResourceSelectionBarComponent
  ],
  templateUrl: './data-perspective.component.html',
  styleUrls: ['../perspective-shared.scss', './data-perspective.component.scss']
})
export class DataPerspectiveComponent implements OnInit, OnDestroy {
  public resources: AzureDataResource[] = [];
  public loading = false;
  public loadingDetails = false;
  public error: string | null = null;
  public panels: ResourcePanelConfig[] = [];
  public browseResource: AzureResourceDetail | null = null;
  public filterQuery = '';

  private readonly destroy$ = new Subject<void>();
  private detailRequestId = 0;

  constructor(
    private readonly resourceGraph: ResourceGraphService,
    private readonly panelService: ResourceDetailPanelService
  ) {
  }

  /** Loads the data resources and mirrors the shared panel state. */
  public ngOnInit(): void {
    this.loadResources();
    this.panelService.panels$
      .pipe(takeUntil(this.destroy$))
      .subscribe((panels) => this.panels = panels);
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Filtered resources grouped into sorted category and type sections. */
  public get categoryGroups(): PerspectiveResourceCategoryGroup<
    DataResourceCategory,
    AzureDataResource
  >[] {
    return groupResourcesByCategory(
      this.filteredResources,
      (resource) => resource.category,
      (resource) => resource.type,
      (type) => this.resourceTypeLabel(type)
    );
  }

  /** Data resources matching the current text filter. */
  public get filteredResources(): AzureDataResource[] {
    return this.resources.filter((resource) =>
      matchesTextFilter(this.filterQuery, resource.resourceGroup, resource.name)
    );
  }

  /** Panels pinned into the side-by-side slots. */
  public get pinnedPanels(): ResourcePanelConfig[] {
    return selectPinnedPanels(this.panels);
  }

  /** The floating resource details panel, if one is open. */
  public get floatingPanel(): ResourcePanelConfig | null {
    return selectFloatingPanel(this.panels);
  }

  /** Loads the data resources of the configured subscription. */
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

  /**
   * Opens the resource details panel for a resource. Stale responses are
   * ignored when the user clicks another card before the first one resolves.
   *
   * @param resourceId ARM resource ID of the clicked resource.
   * @param event Optional click event; prevented to keep the card selection.
   */
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

  /**
   * Tells whether the Browse pane supports a resource type.
   *
   * @param resource Data resource shown on a card.
   * @returns True for storage accounts and Cosmos DB accounts.
   */
  public isBrowsable(resource: AzureDataResource): boolean {
    const type = resource.type.toLowerCase();
    return type === 'microsoft.storage/storageaccounts'
      || type === 'microsoft.documentdb/databaseaccounts';
  }

  /**
   * Opens the data Browse pane for a resource.
   *
   * @param resource Data resource to browse.
   * @param event Click event; prevented so the card selection does not change.
   */
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

  /**
   * Returns the display label for a data resource type.
   *
   * @param type Full Azure resource type.
   * @returns A friendly label, falling back to the last type segment.
   */
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

  /**
   * Closes a resource details panel.
   *
   * @param panelId Identifier of the panel to close.
   */
  public closePanel(panelId: string): void {
    this.panelService.closePanel(panelId);
  }

  /** Closes the data Browse pane. */
  public closeBrowse(): void {
    this.browseResource = null;
  }

  /**
   * Changes the pinned state of a resource details panel.
   *
   * @param panelId Identifier of the panel to pin or unpin.
   */
  public togglePanelPin(panelId: string): void {
    this.panelService.togglePin(panelId);
  }
}
