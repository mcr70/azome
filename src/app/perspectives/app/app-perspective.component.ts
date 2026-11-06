import { Component, OnDestroy, OnInit } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ResourceSelectionBarComponent } from '@components/resource-selection-bar.component';
import { ResourceCardComponent } from '@components/resource-card/resource-card.component';
import { ResourceGridSelectionComponent } from '@components/resource-grid-selection/resource-grid-selection.component';
import { ResourceDetailPaneComponent } from '@components/resources/resource-detail-pane.component';
import { TextFilterComponent } from '@components/text-filter/text-filter.component';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { matchesTextFilter } from '@app/utils/text-filter';
import {
  AzureResourceDetail,
  AzureAppResource,
  AzureTaggedAppResource,
  AppResourceCategory,
  ResourceGraphService
} from '@services/azure/resource-graph.service';
import {
  ResourceDetailPanelService,
  ResourcePanelConfig
} from '@services/azome/resource-detail-panel.service';
import {
  groupResourcesByCategory,
  PerspectiveResourceCategoryGroup
} from '../perspective-resource-groups';
import { selectFloatingPanel, selectPinnedPanels } from '../perspective-utils';
import { ResourceDetailsActionComponent } from '@app/components/resource-card/actions/resource-details-action.component';

interface AppGroup {
  name: string;
  resources: AzureTaggedAppResource[];
}

/**
 * Applications perspective.
 *
 * Shows application-centric resources either grouped by category and type, or
 * grouped into logical applications based on the `azome-apps` resource tag.
 */
@Component({
  selector: 'app-app-perspective',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    ResourceDetailPaneComponent,
    ResourceCardComponent,
    ResourceGridSelectionComponent,
    TextFilterComponent,
    ResourceSelectionBarComponent,
    ResourceDetailsActionComponent
],
  templateUrl: './app-perspective.component.html',
  styleUrls: ['../perspective-shared.scss', './app-perspective.component.scss']
})
export class AppPerspectiveComponent implements OnInit, OnDestroy {
  public resources: AzureAppResource[] = [];
  public loading = false;
  public loadingDetails = false;
  public error: string | null = null;
  public panels: ResourcePanelConfig[] = [];
  public filterQuery = '';
  public activeTab: 'categories' | 'apps' = 'apps';
  public taggedResources: AzureTaggedAppResource[] = [];

  private readonly destroy$ = new Subject<void>();
  private detailRequestId = 0;
  private resourceRequest?: Subscription;

  constructor(
    private readonly resourceGraph: ResourceGraphService,
    private readonly panelService: ResourceDetailPanelService
  ) {
  }

  /** Loads the resources of the active tab and mirrors the shared panel state. */
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
    AppResourceCategory,
    AzureAppResource
  >[] {
    return groupResourcesByCategory(
      this.filteredResources,
      (resource) => resource.category,
      (resource) => resource.type ?? '',
      (type, resources) => this.resourceTypeLabel(type, resources[0]?.kind)
    );
  }

  /** Application resources matching the current text filter. */
  public get filteredResources(): AzureAppResource[] {
    return this.resources.filter((resource) =>
      matchesTextFilter(this.filterQuery, resource.resourceGroup, resource.name, resource.kind)
    );
  }

  /**
   * Resources grouped into applications by their `azome-apps` tag. App names
   * are trimmed, empty names are ignored, and each app lists a resource once.
   */
  public get appGroups(): AppGroup[] {
    const apps = new Map<string, AzureTaggedAppResource[]>();

    for (const resource of this.taggedResources) {
      const names = new Set(
        (resource.tags['azome-apps'] ?? '').split(',').map((name) => name.trim()).filter(Boolean)
      );

      for (const name of names) {
        if (!matchesTextFilter(
          this.filterQuery, name, resource.resourceGroup, resource.name, resource.kind
        )) {
          continue;
        }

        const resources = apps.get(name) ?? [];
        resources.push(resource);
        apps.set(name, resources);
      }
    }

    return Array.from(apps, ([name, resources]) => ({ name, resources }))
      .sort((appA, appB) => appA.name.localeCompare(appB.name));
  }

  /** Whether any loaded resource declares at least one app membership. */
  public get hasAppMemberships(): boolean {
    return this.taggedResources.some((resource) =>
      resource.tags['azome-apps']?.split(',').some((name) => name.trim())
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

  /**
   * Loads the resources of the active tab, replacing any request still in
   * flight. The Categories tab lists app resources by type; the Apps tab loads
   * the resources tagged with app memberships.
   */
  public loadResources(): void {
    this.resourceRequest?.unsubscribe();
    this.loading = true;
    this.error = null;

    if (this.activeTab === 'apps') {
      this.resourceRequest = this.resourceGraph.getTaggedApplicationResources()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (resources) => {
            this.taggedResources = resources;
            this.loading = false;
          },
          error: (error: unknown) => this.onResourceLoadError(error)
        });
      return;
    }

    this.resourceRequest = this.resourceGraph.getApplicationResources()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resources) => {
          this.resources = resources;
          this.loading = false;
        },
        error: (error: unknown) => this.onResourceLoadError(error)
      });
  }

  /**
   * Activates a view tab and loads its data when the tab actually changes.
   *
   * @param tab Tab to activate.
   */
  public selectTab(tab: 'categories' | 'apps'): void {
    if (tab === this.activeTab) {
      return;
    }

    this.activeTab = tab;
    this.loadResources();
  }

  /**
   * Opens the resource details panel for a resource.
   *
   * @param resourceId ARM resource ID of the selected resource.
   */
  public selectResourceById(resourceId: string): void {
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
   * Returns the display label for an application resource type.
   *
   * @param type Full Azure resource type.
   * @param kind Optional resource kind used to tell Function Apps apart from App Services.
   * @returns A friendly label, falling back to the last type segment.
   */
  public resourceTypeLabel(type: string, kind?: string): string {
    const normalizedType = type.toLowerCase();
    const normalizedKind = kind?.toLowerCase() ?? '';

    const labels: Record<string, string> = {
      'microsoft.web/sites': normalizedKind.includes('functionapp') ? 'Function apps' : 'App services',
      'microsoft.web/serverfarms': 'App service plans',
      'microsoft.app/containerapps': 'Container apps',
      'microsoft.app/managedenvironments': 'Container app environments',
      'microsoft.logic/workflows': 'Logic apps',
      'microsoft.containerinstance/containergroups': 'Container groups'
    };

    return labels[normalizedType] ?? type.split('/').pop() ?? type;
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

  /**
   * Reports a resource list load failure and resets the loading state.
   *
   * @param error Error raised by the Resource Graph query.
   */
  private onResourceLoadError(error: unknown): void {
    console.error('Failed to load app resources:', error);
    this.error = 'Application resources could not be loaded. Check your subscription access and try again.';
    this.loading = false;
  }
}
