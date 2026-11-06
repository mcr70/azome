import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { EMPTY, from, Subject } from 'rxjs';
import { catchError, finalize, mergeMap, takeUntil, tap } from 'rxjs/operators';
import { ResourceGroup, ResourceGroupService } from '@services/azure/resource-group.service';
import { AzureResource, ResourceGraphService } from '@services/azure/resource-graph.service';
import { ResourceTypeIconComponent } from '@components/resource-card/resource-type-icon.component';
import { ResourceCardComponent } from '@components/resource-card/resource-card.component';
import { ResourceGridSelectionComponent } from '@components/resource-grid-selection/resource-grid-selection.component';
import { ResourceDetailPanelService } from '@services/azome/resource-detail-panel.service';
import { TextFilterComponent } from '@components/text-filter/text-filter.component';
import { matchesTextFilter } from '@app/utils/text-filter';
import { ResourceSelectionService } from '@services/azome/resource-selection.service';
import { shortResourceTypeName } from '../perspective-utils';
import { ResourceDetailsActionComponent } from '@app/components/resource-card/actions/resource-details-action.component';
import { ResourceMetricsActionComponent } from '@app/components/resource-card/actions/resource-metrics-action.component';


/**
 * Expandable resource group list of the Resources perspective.
 *
 * Lists the resource groups of the subscription, lazily loads the resources of
 * a group when it is expanded or when the text filter needs them, and opens
 * resource details in the panels owned by the perspective shell.
 */
@Component({
  selector: 'app-resource-group-list',
  standalone: true,
  imports: [
    ResourceTypeIconComponent,
    ResourceCardComponent,
    ResourceGridSelectionComponent,
    TextFilterComponent,
    ResourceMetricsActionComponent, ResourceDetailsActionComponent
],
  templateUrl: './resource-group-list.component.html',
  styleUrls: ['../perspective-shared.scss', './resource-group-list.component.scss']
})
export class ResourceGroupListComponent implements OnInit, OnDestroy {

  /** Emits the loading state of the group list so the shell can disable Refresh. */
  @Output() loadingChange = new EventEmitter<boolean>();

  public resourceGroups: ResourceGroup[] = [];
  public loading = false;
  public error: string | null = null;

  public expandedGroups = new Set<string>();
  public groupResources: { [groupName: string]: AzureResource[] } = {};
  public loadingResources: { [groupName: string]: boolean } = {};

  public loadingDetails = false;
  public filterQuery = '';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly resourceGroupService: ResourceGroupService,
    private readonly resourceGraphService: ResourceGraphService,
    private readonly panelService: ResourceDetailPanelService,
    private readonly resourceSelection: ResourceSelectionService
  ) {}

  /** Loads the resource groups of the subscription. */
  public ngOnInit(): void {
    this.loadResourceGroups();
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Resource groups matching the current text filter. A group matches by its
   * own name or when any of its already loaded resources matches.
   */
  public get filteredResourceGroups(): ResourceGroup[] {
    return this.resourceGroups.filter((group) =>
      matchesTextFilter(this.filterQuery, group.name)
      || (this.groupResources[group.name] ?? []).some((resource) =>
        matchesTextFilter(this.filterQuery, group.name, resource.name)
      )
    );
  }

  /** Whether group contents are still loading for an active text filter. */
  public get loadingFilteredResources(): boolean {
    return this.filterQuery.trim().length > 0
      && this.resourceGroups.some((group) => this.loadingResources[group.name]);
  }

  /**
   * Reloads the resource groups and the contents of the expanded groups,
   * discarding previously cached group resources.
   */
  public refresh(): void {
    this.groupResources = {};
    this.loadingResources = {};
    this.loadResourceGroups();

    // Reload the groups the user already has open so they show fresh data.
    for (const groupName of this.expandedGroups) {
      this.fetchResourcesForGroup(groupName);
    }
  }

  /**
   * Loads the resource groups of the subscription and expands the groups that
   * contain currently selected resources.
   */
  public loadResourceGroups(): void {
    this.setLoading(true);
    this.error = null;

    this.resourceGroupService.getResourceGroups()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (groups) => {
          this.resourceGroups = groups;
          this.expandSelectedResourceGroups(groups);
          this.setLoading(false);
        },
        error: (error) => {
          console.error('Failed to fetch resource groups:', error);
          this.error = error.message || 'Failed to fetch resource groups from Azure API';
          this.setLoading(false);
        }
      });
  }

  /**
   * Expands or collapses a resource group, loading its resources on first expand.
   *
   * @param groupName Name of the resource group.
   */
  public toggleGroup(groupName: string): void {
    if (this.expandedGroups.has(groupName)) {
      this.expandedGroups.delete(groupName);
      return;
    }

    this.expandedGroups.add(groupName);

    if (!this.groupResources[groupName]) {
      this.fetchResourcesForGroup(groupName);
    }
  }

  /**
   * Tells whether a resource group is currently expanded.
   *
   * @param groupName Name of the resource group.
   * @returns True when the group is expanded.
   */
  public isGroupExpanded(groupName: string): boolean {
    return this.expandedGroups.has(groupName);
  }

  /**
   * Applies a new text filter. Because filtering also inspects group contents,
   * the resources of all not-yet-loaded groups are fetched with a bounded
   * concurrency of five parallel requests.
   *
   * @param query Filter text entered by the user.
   */
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

  /**
   * Resources of a group matching the current text filter.
   *
   * @param groupName Name of the resource group.
   * @returns Matching resources, or an empty list when not loaded yet.
   */
  public filteredGroupResources(groupName: string): AzureResource[] {
    return (this.groupResources[groupName] ?? []).filter((resource) =>
      matchesTextFilter(this.filterQuery, groupName, resource.name)
    );
  }

  /**
   * Opens the resource details panel for a resource.
   *
   * @param resource Resource selected from the group grid.
   */
  public selectResource(resource: AzureResource): void {
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


  /**
   * Opens the resource details panel for a resource.
   *
   * @param resourceId ARM resource ID of the selected resource.
   */
  public selectResourceById(resourceId: string): void {
    this.loadingDetails = true;

    this.resourceGraphService.getResourceDetails(resourceId)
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
   * Returns the short display name of a full resource type.
   *
   * @param fullType Full Azure resource type.
   * @returns The last type segment, or "Resource" when the type is empty.
   */
  public getShortType(fullType: string): string {
    return shortResourceTypeName(fullType);
  }

  /**
   * Loads the resources of a group unless a request is already running.
   *
   * @param groupName Name of the resource group.
   */
  private fetchResourcesForGroup(groupName: string): void {
    if (this.loadingResources[groupName]) {
      return;
    }

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

  /**
   * Expands the groups containing globally selected resources and preloads
   * their contents so the selected resources are visible on entry.
   *
   * @param groups All resource groups of the subscription.
   */
  private expandSelectedResourceGroups(groups: ResourceGroup[]): void {
    for (const resource of this.resourceSelection.selectedResources) {
      const group = groups.find(
        (candidate) => candidate.name.toLocaleLowerCase() === resource.resourceGroup.toLocaleLowerCase()
      );

      if (!group) {
        continue;
      }

      this.expandedGroups.add(group.name);
      if (!this.groupResources[group.name]) {
        this.fetchResourcesForGroup(group.name);
      }
    }
  }

  /**
   * Updates the loading state and notifies the perspective shell.
   *
   * @param value New loading state.
   */
  private setLoading(value: boolean): void {
    this.loading = value;
    this.loadingChange.emit(value);
  }
}
