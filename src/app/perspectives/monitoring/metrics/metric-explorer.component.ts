import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { forkJoin, Observable, of, Subject, Subscription } from 'rxjs';
import { catchError, map, takeUntil } from 'rxjs/operators';
import {
  AzureMetricDefinition,
  MetricAggregation
} from '@services/azure/azure-metrics.service';
import { SelectedAzureResource } from '@services/azome/resource-selection.service';
import {
  MetricChart,
  MetricQuery,
  MetricTimeRange,
  ResourceMetricDefinitions,
  METRIC_AGGREGATIONS
} from './metrics.model';
import { MetricsSupportService } from './metrics-support.service';

@Component({
  selector: 'app-metric-explorer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './metric-explorer.component.html',
  styleUrls: ['./metrics-shared.scss', './metric-explorer.component.scss']
})
export class MetricExplorerComponent implements OnChanges, OnDestroy {
  @Input() resources: SelectedAzureResource[] = [];
  @Input() initialResource: SelectedAzureResource | null = null;
  @Input() timeRange: MetricTimeRange = '24h';
  @Input() active = false;

  public selectedExplorerResourceIds: string[] = [];
  public selectedExplorerMetricNames: string[] = [];
  public selectedExplorerAggregation: MetricAggregation = 'Average';
  public explorerMetrics: MetricChart[] = [];
  public explorerResourceDefinitions: ResourceMetricDefinitions[] = [];
  public explorerError: string | null = null;
  public loadingExplorerDefinitions = false;
  public queryingExplorer = false;

  private readonly destroy$ = new Subject<void>();
  private definitionsRequest?: Subscription;
  private queryRequest?: Subscription;
  private lastInitialResourceId: string | null = null;
  private excludedInitialResourceId: string | null = null;
  private readonly unsupportedMetricResourceErrors = new Map<string, string>();

  constructor(public readonly metricsSupport: MetricsSupportService) {}

  /**
   * Updates resource selection and refreshes metric definitions or queries after input changes.
   *
   * @param changes Angular input changes for this component.
   */
  public ngOnChanges(changes: SimpleChanges): void {
    let linkedResourceChanged = false;

    if (changes['initialResource']) {
      this.unsupportedMetricResourceErrors.clear();
      const currentResourceId = this.initialResource?.id.toLocaleLowerCase() ?? null;

      if (this.initialResource && currentResourceId !== this.lastInitialResourceId) {
        linkedResourceChanged = true;
        this.selectedExplorerResourceIds = [this.initialResource.id];
        this.selectedExplorerMetricNames = [];
        this.excludedInitialResourceId = null;
      }

      this.lastInitialResourceId = currentResourceId;

      if (!this.initialResource) {
        this.excludedInitialResourceId = null;
      }
    }

    if (changes['resources'] || changes['initialResource']) {
      if (changes['resources']) {
        this.unsupportedMetricResourceErrors.clear();
      }

      if (linkedResourceChanged && this.initialResource) {
        this.selectedExplorerResourceIds = [this.initialResource.id];
        this.loadExplorerDefinitions();
      } else {
        this.updateResourceSelection();
      }
    }

    if (changes['timeRange'] && this.active && this.selectedExplorerMetricNames.length > 0) {
      this.queryExplorer();
    }
  }

  /**
   * Cancels active definition and metric requests when the component is destroyed.
   */
  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.definitionsRequest?.unsubscribe();
    this.queryRequest?.unsubscribe();
  }

  /**
   * Returns resources currently selected for the Explorer query.
   * @returns Selected resources in the current resource list.
   */
  public get explorerResources(): SelectedAzureResource[] {
    const selectedIds = new Set(this.selectedExplorerResourceIds.map((id) => id.toLocaleLowerCase()));

    return this.resources.filter((resource) =>
      selectedIds.has(resource.id.toLocaleLowerCase())
    );
  }

  /**
   * Checks whether every selectable resource is selected.
   * @returns True when at least one selectable resource exists and all are selected.
   */
  public get allExplorerResourcesSelected(): boolean {
    const selectableResources = this.selectableExplorerResources;

    return selectableResources.length > 0
      && selectableResources.every((resource) =>
        this.selectedExplorerResourceIds.some((id) =>
          id.toLocaleLowerCase() === resource.id.toLocaleLowerCase()
        )
      );
  }

  /**
   * Checks whether the Explorer resource selection is partial.
   * @returns True when some, but not all, selectable resources are selected.
   */
  public get someExplorerResourcesSelected(): boolean {
    return this.selectableExplorerResources.some((resource) =>
      this.selectedExplorerResourceIds.some((id) =>
        id.toLocaleLowerCase() === resource.id.toLocaleLowerCase()
      )
    ) && !this.allExplorerResourcesSelected;
  }

  /**
   * Returns resources not known to be unsupported for Azure Monitor metrics.
   * @returns Resources that can be selected in the Explorer.
   */
  public get selectableExplorerResources(): SelectedAzureResource[] {
    return this.resources.filter((resource) =>
      !this.unsupportedMetricResourceErrors.has(resource.id.toLocaleLowerCase())
    );
  }

  /**
   * Returns the recorded unsupported-resource message when one is available.
   *
   * @param resourceId Azure resource ID to look up.
   * @returns The error message, or null when no unsupported-resource error is recorded.
   */
  public unsupportedResourceError(resourceId: string): string | null {
    return this.unsupportedMetricResourceErrors.get(resourceId.toLocaleLowerCase()) ?? null;
  }

  /**
   * Returns metric definitions supported by every selected supported resource.
   * @returns Common metric definitions, or an empty array when none are available.
   */
  public get explorerMetricOptions(): AzureMetricDefinition[] {
    const supportedDefinitions = this.explorerResourceDefinitions
      .filter((resource) => !resource.unsupported);

    if (supportedDefinitions.length === 0) {
      return [];
    }

    // Keep only metrics present on every supported resource.
    const definitions = supportedDefinitions[0].definitions;
    const commonNames = new Set(
      definitions.map((definition) => definition.name.value.toLocaleLowerCase())
    );

    for (const resource of supportedDefinitions.slice(1)) {
      const resourceNames = new Set(
        resource.definitions.map((definition) => definition.name.value.toLocaleLowerCase())
      );

      for (const name of commonNames) {
        if (!resourceNames.has(name)) {
          commonNames.delete(name);
        }
      }
    }

    return definitions.filter((definition) =>
      commonNames.has(definition.name.value.toLocaleLowerCase())
    );
  }

  /**
   * Finds aggregations supported by all metrics selected in the Explorer.
   * @returns Common supported aggregations, or an empty array for an invalid selection.
   */
  public get explorerAggregationOptions(): MetricAggregation[] {
    const definitions = this.selectedExplorerMetricNames.map((name) =>
      this.explorerMetricOptions.find((metric) => metric.name.value === name)
    );

    if (definitions.length === 0 || definitions.some((definition) => !definition)) {
      return [];
    }

    const firstDefinition = definitions[0];

    if (!firstDefinition) {
      return [];
    }

    // Offer only aggregations shared by every selected metric.
    return this.metricsSupport.supportedAggregations(firstDefinition).filter((aggregation) =>
      definitions.every((definition) =>
        definition !== undefined
        && this.metricsSupport.supportedAggregations(definition).includes(aggregation)
      )
    );
  }

  /**
   * Adds or removes one supported resource from the Explorer selection.
   *
   * @param resourceId ID of the resource to toggle.
   * @param event Change event from the resource checkbox.
   */
  public toggleExplorerResource(resourceId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const resource = this.resources.find((item) =>
      item.id.toLocaleLowerCase() === resourceId.toLocaleLowerCase()
    );

    if (!resource || this.unsupportedResourceError(resource.id)) {
      return;
    }

    const normalizedId = resource.id.toLocaleLowerCase();
    const selectedIds = new Set(
      this.selectedExplorerResourceIds.map((id) => id.toLocaleLowerCase())
    );

    if (input.checked) {
      selectedIds.add(normalizedId);

      if (normalizedId === this.initialResource?.id.toLocaleLowerCase()) {
        this.excludedInitialResourceId = null;
      }
    } else {
      selectedIds.delete(normalizedId);

      if (normalizedId === this.initialResource?.id.toLocaleLowerCase()) {
        this.excludedInitialResourceId = normalizedId;
      }
    }

    this.selectedExplorerResourceIds = this.resources
      .filter((item) => selectedIds.has(item.id.toLocaleLowerCase()))
      .map((item) => item.id);
    this.loadExplorerDefinitions();
  }

  /**
   * Selects or clears all resources currently supported by the Explorer.
   *
   * @param event Change event from the select-all checkbox.
   */
  public toggleAllExplorerResources(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedExplorerResourceIds = input.checked
      ? this.selectableExplorerResources.map((resource) => resource.id)
      : [];

    if (this.initialResource && !input.checked) {
      this.excludedInitialResourceId = this.initialResource.id.toLocaleLowerCase();
    } else if (this.initialResource && input.checked
      && !this.unsupportedResourceError(this.initialResource.id)) {
      this.excludedInitialResourceId = null;
    }

    this.loadExplorerDefinitions();
  }

  /**
   * Stores selected metric names and updates the compatible aggregation.
   *
   * @param select Metric selector containing the selected options.
   */
  public selectExplorerMetrics(select: HTMLSelectElement): void {
    this.selectedExplorerMetricNames = Array.from(select.selectedOptions)
      .map((option) => option.value);
    this.ensureExplorerAggregation();
  }

  /**
   * Selects an aggregation only when it is supported by all selected metrics.
   *
   * @param value Aggregation name to select.
   */
  public selectExplorerAggregation(value: string): void {
    const aggregation = METRIC_AGGREGATIONS.find((option) => option === value);

    if (aggregation && this.explorerAggregationOptions.includes(aggregation)) {
      this.selectedExplorerAggregation = aggregation;
    }
  }

  /**
   * Queries selected metrics for selected resources using the active time range.
   */
  public queryExplorer(): void {
    this.queryRequest?.unsubscribe();
    this.explorerError = null;

    const definitions = this.selectedExplorerMetricNames
      .map((name) => this.explorerMetricOptions.find((metric) => metric.name.value === name))
      .filter((definition): definition is AzureMetricDefinition => definition !== undefined);
    const resources = this.explorerResources;

    if (definitions.length === 0 || resources.length === 0) {
      this.explorerError = 'Select at least one resource and one metric to run a query.';
      this.explorerMetrics = [];
      return;
    }

    const aggregation = this.explorerAggregationOptions.includes(this.selectedExplorerAggregation)
      ? this.selectedExplorerAggregation
      : this.explorerAggregationOptions[0];

    if (!aggregation) {
      this.explorerError = 'The selected metrics have no common supported aggregation.';
      this.explorerMetrics = [];
      return;
    }

    const range = this.metricsSupport.timeRange(this.timeRange);
    const end = new Date();
    const start = new Date(end.getTime() - range.durationMs);
    const queries: MetricQuery[] = resources.flatMap((resource) =>
      definitions.map((definition) => ({ resource, definition, aggregation }))
    );

    this.queryingExplorer = true;
    this.explorerMetrics = [];
    this.queryRequest = this.metricsSupport.queryMetrics(queries, start, end, range.interval)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results) => {
          this.explorerMetrics = results;
          this.queryingExplorer = false;
        },
        error: (error: unknown) => {
          console.error('Failed to query Azure Monitor metrics:', error);
          this.explorerError = 'Metrics could not be queried. Check your Azure Monitor access.';
          this.queryingExplorer = false;
        }
      });
  }

  /**
   * Refreshes the current query when resources and metrics are selected.
   */
  public refreshMetrics(): void {
    if (this.selectedExplorerMetricNames.length > 0 && this.explorerResources.length > 0) {
      this.queryExplorer();
    }
  }

  /**
   * Resets the selected aggregation when it is unsupported by the current metrics.
   */
  private ensureExplorerAggregation(): void {
    const aggregations = this.explorerAggregationOptions;

    if (!aggregations.includes(this.selectedExplorerAggregation)) {
      this.selectedExplorerAggregation = aggregations[0] ?? 'Average';
    }
  }

  /**
   * Rebuilds the selected resources and loads their metric definitions.
   */
  private updateResourceSelection(): void {
    this.selectedExplorerResourceIds = [
      ...this.resources.map((resource) => resource.id),
      ...(this.initialResource
        && this.excludedInitialResourceId !== this.initialResource.id.toLocaleLowerCase()
        ? [this.initialResource.id]
        : [])
    ];
    this.loadExplorerDefinitions();
  }

  /**
   * Loads metric definitions for the currently selected resources.
   */
  private loadExplorerDefinitions(): void {
    this.definitionsRequest?.unsubscribe();
    this.explorerResourceDefinitions = [];
    this.explorerMetrics = [];
    this.explorerError = null;

    const resources = this.explorerResources;

    if (resources.length === 0) {
      this.loadingExplorerDefinitions = false;
      return;
    }

    this.loadingExplorerDefinitions = true;
    const requests: Observable<ResourceMetricDefinitions>[] = resources.map((resource) =>
      this.metricsSupport.getMetricDefinitions(resource.id).pipe(
        map((definitions): ResourceMetricDefinitions => ({ resource, definitions })),
        catchError((error: unknown): Observable<ResourceMetricDefinitions> => {
          console.error(`Failed to load metric definitions for ${resource.id}:`, error);
          const errorMessage = this.metricsSupport.errorMessage(
            error,
            'Metric definitions could not be loaded.'
          );
          const unsupported = this.metricsSupport.isUnsupportedResourceError(
            errorMessage,
            resource.type
          );

          if (unsupported) {
            this.unsupportedMetricResourceErrors.set(
              resource.id.toLocaleLowerCase(),
              errorMessage
            );
          }

          return of({ resource, definitions: [], error: errorMessage, unsupported });
        })
      )
    );

    this.definitionsRequest = forkJoin(requests)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results) => {
          this.explorerResourceDefinitions = results;
          const unsupportedIds = new Set(
            results
              .filter((result) => result.unsupported)
              .map((result) => result.resource.id.toLocaleLowerCase())
          );
          this.selectedExplorerResourceIds = this.selectedExplorerResourceIds.filter(
            (id) => !unsupportedIds.has(id.toLocaleLowerCase())
          );
          const availableNames = new Set(
            this.explorerMetricOptions.map((metric) => metric.name.value)
          );
          this.selectedExplorerMetricNames = this.selectedExplorerMetricNames
            .filter((name) => availableNames.has(name));
          this.ensureExplorerAggregation();
          this.explorerError = results.find((result) => result.error && !result.unsupported)
            ?.error ?? null;
          this.loadingExplorerDefinitions = false;
        },
        error: (error: unknown) => {
          console.error('Failed to load metric explorer definitions:', error);
          this.explorerError = this.metricsSupport.errorMessage(
            error,
            'Metric definitions could not be loaded.'
          );
          this.loadingExplorerDefinitions = false;
        }
      });
  }
}
