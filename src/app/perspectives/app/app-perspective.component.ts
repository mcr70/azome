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

interface AppResourceTypeGroup {
  type: string;
  label: string;
  resources: AzureAppResource[];
}

interface AppResourceCategoryGroup {
  category: AppResourceCategory;
  types: AppResourceTypeGroup[];
}

interface AppGroup {
  name: string;
  resources: AzureTaggedAppResource[];
}

@Component({
  selector: 'app-app-perspective',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    ResourceDetailPaneComponent,
    ResourceCardComponent,
    ResourceGridSelectionComponent,
    TextFilterComponent,
    ResourceSelectionBarComponent
  ],
  templateUrl: './app-perspective.component.html',
  styleUrl: './app-perspective.component.scss'
})
export class AppPerspectiveComponent implements OnInit, OnDestroy {
  public resources: AzureAppResource[] = [];
  public loading = false;
  public loadingDetails = false;
  public error: string | null = null;
  public panels: ResourcePanelConfig[] = [];
  public filterQuery = '';
  public activeTab: 'categories' | 'apps' = 'categories';
  public taggedResources: AzureTaggedAppResource[] = [];

  private readonly destroy$ = new Subject<void>();
  private detailRequestId = 0;
  private resourceRequest?: Subscription;

  constructor(
    private readonly resourceGraph: ResourceGraphService,
    private readonly panelService: ResourceDetailPanelService
  ) {
  }

  ngOnInit(): void {
    this.loadResources();
    this.panelService.panels$
      .pipe(takeUntil(this.destroy$))
      .subscribe((panels) => this.panels = panels);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }


  public get categoryGroups(): AppResourceCategoryGroup[] {
    const categories = new Map<AppResourceCategory, Map<string, AzureAppResource[]>>();

    for (const resource of this.filteredResources) {
      const category = resource.category;
      const categoryTypes = categories.get(category) ?? new Map<string, AzureAppResource[]>();
      const resourceType = (resource.type ?? '').toLowerCase();
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
            label: this.resourceTypeLabel(type, resources[0]?.kind),
            resources
          }))
      }));
  }

  public get filteredResources(): AzureAppResource[] {
    return this.resources.filter((resource) =>
      matchesTextFilter(this.filterQuery, resource.resourceGroup, resource.name, resource.kind)
    );
  }

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

  public get hasAppMemberships(): boolean {
    return this.taggedResources.some((resource) =>
      resource.tags['azome-apps']?.split(',').some((name) => name.trim())
    );
  }

  public get pinnedPanels(): ResourcePanelConfig[] {
    return this.panels.filter((panel) => panel.pinned);
  }

  public get floatingPanel(): ResourcePanelConfig | null {
    return this.panels.find((panel) => !panel.pinned) ?? null;
  }


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

  public selectTab(tab: 'categories' | 'apps'): void {
    if (tab === this.activeTab) {
      return;
    }

    this.activeTab = tab;
    this.loadResources();
  }

  private onResourceLoadError(error: unknown): void {
    console.error('Failed to load app resources:', error);
    this.error = 'Application resources could not be loaded. Check your subscription access and try again.';
    this.loading = false;
  }

  public openResourceDetails(resourceId: string, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    const requestId = ++this.detailRequestId;
    this.loadingDetails = true;
    this.resourceGraph.getResourceDetails(resourceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (details: AzureResourceDetail | null) => {
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

          console.error('Failed to fetch app resource details:', error);
          this.loadingDetails = false;
        }
      });
  }

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

  public closePanel(panelId: string): void {
    this.panelService.closePanel(panelId);
  }

  public togglePanelPin(panelId: string): void {
    this.panelService.togglePin(panelId);
  }

}
