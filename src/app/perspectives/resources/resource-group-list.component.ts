import { Component, OnDestroy, OnInit } from '@angular/core';

import { EMPTY, from, Subject } from 'rxjs';
import { catchError, finalize, mergeMap, takeUntil, tap } from 'rxjs/operators';
import { ResourceGroup, ResourceGroupService } from '@services/azure/resource-group.service';
import { AzureResource, ResourceGraphService } from '@services/azure/resource-graph.service';
import { ResourceDetailPaneComponent } from '@components/resources/resource-detail-pane.component';
import { ResourceTypeIconComponent } from '@components/resource-type-icon.component';
import { ResourceCardComponent } from '@components/resource-card/resource-card.component';
import { ResourceDetailPanelService, ResourcePanelConfig } from '@services/azome/resource-detail-panel.service';
import { TextFilterComponent } from '@components/text-filter/text-filter.component';
import { matchesTextFilter } from '@app/utils/text-filter';

@Component({
  selector: 'app-resource-group-list',
  standalone: true,
  imports: [
    ResourceDetailPaneComponent,
    ResourceTypeIconComponent,
    ResourceCardComponent,
    TextFilterComponent
  ],
  templateUrl: './resource-group-list.component.html',
  styleUrl: './resource-group-list.component.scss'
})
export class ResourceGroupListComponent implements OnInit, OnDestroy {

  public resourceGroups: ResourceGroup[] = [];
  public loading = false;
  public error: string | null = null;

  public expandedGroup: string | null = null;
  public groupResources: { [groupName: string]: AzureResource[] } = {};
  public loadingResources: { [groupName: string]: boolean } = {};

  public loadingDetails = false;
  public panels: ResourcePanelConfig[] = [];
  public filterQuery = '';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private resourceGroupService: ResourceGroupService,
    private resourceGraphService: ResourceGraphService,
    private panelService: ResourceDetailPanelService
  ) {}

  ngOnInit(): void {
    this.loadResourceGroups();
    this.panelService.panels$.pipe(takeUntil(this.destroy$)).subscribe((panels) => this.panels = panels);
  }

  public get pinnedPanels(): ResourcePanelConfig[] {
    return this.panels.filter((panel) => panel.pinned);
  }

  public get floatingPanel(): ResourcePanelConfig | null {
    return this.panels.find((panel) => !panel.pinned) ?? null;
  }

  public get filteredResourceGroups(): ResourceGroup[] {
    return this.resourceGroups.filter((group) =>
      matchesTextFilter(this.filterQuery, group.name)
      || (this.groupResources[group.name] ?? []).some((resource) =>
        matchesTextFilter(this.filterQuery, group.name, resource.name)
      )
    );
  }

  public get loadingFilteredResources(): boolean {
    return this.filterQuery.trim().length > 0
      && this.resourceGroups.some((group) => this.loadingResources[group.name]);
  }

  public loadResourceGroups(): void {
    this.loading = true;
    this.error = null;

    this.resourceGroupService.getResourceGroups()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (groups) => {
          this.resourceGroups = groups;
          this.loading = false;
        },
        error: (error) => {
          console.error('Failed to fetch resource groups:', error);
          this.error = error.message || 'Failed to fetch resource groups from Azure API';
          this.loading = false;
        }
      });
  }

  public toggleGroup(groupName: string): void {
    if (this.expandedGroup === groupName) {
      this.expandedGroup = null;
      return;
    }

    this.expandedGroup = groupName;

    if (!this.groupResources[groupName]) {
      this.fetchResourcesForGroup(groupName);
    }
  }

  public onFilterChange(query: string): void {
    this.filterQuery = query;

    if (!query.trim()) {
      return;
    }

    const groupsToLoad = this.resourceGroups.filter((group) =>
      !this.groupResources[group.name] && !this.loadingResources[group.name]
    );

    from(groupsToLoad)
      .pipe(
        mergeMap((group) => {
          this.loadingResources[group.name] = true;
          return this.resourceGraphService.getResourcesByResourceGroup(group.name).pipe(
            tap((resources) => this.groupResources[group.name] = resources),
            catchError((error: unknown) => {
              console.error(`Failed to fetch resources for group ${group.name}:`, error);
              this.groupResources[group.name] = [];
              return EMPTY;
            }),
            finalize(() => this.loadingResources[group.name] = false)
          );
        }, 5),
        takeUntil(this.destroy$)
      )
      .subscribe();
  }

  public filteredGroupResources(groupName: string): AzureResource[] {
    return (this.groupResources[groupName] ?? []).filter((resource) =>
      matchesTextFilter(this.filterQuery, groupName, resource.name)
    );
  }

  public selectResource(resource: AzureResource): void {
    //this.selectedResource = resource;
    this.loadingDetails = true;

    this.resourceGraphService.getResourceDetails(resource.id)
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

  private fetchResourcesForGroup(groupName: string): void {
    this.loadingResources[groupName] = true;

    this.resourceGraphService.getResourcesByResourceGroup(groupName)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resources) => {
          this.groupResources[groupName] = resources;
          this.loadingResources[groupName] = false;
        },
        error: (err) => {
          console.error(`Failed to fetch resources for group ${groupName}:`, err);
          this.groupResources[groupName] = [];
          this.loadingResources[groupName] = false;
        }
      });
  }

  public getShortType(fullType: string): string {
    if (!fullType) return 'Resource';
    const parts = fullType.split('/');
    return parts[parts.length - 1] || fullType;
  }

  public closePanel(panelId: string): void { this.panelService.closePanel(panelId); }
  public togglePanelPin(panelId: string): void { this.panelService.togglePin(panelId); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
