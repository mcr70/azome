import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { forkJoin, from, Observable, of, Subject, Subscription } from 'rxjs';
import { catchError, map, mergeMap, switchMap, takeUntil } from 'rxjs/operators';
import {
  AzureMetricDataPoint,
  AzureMetricDefinition,
  AzureMetricsService,
  MetricAggregation
} from '@services/azure/azure-metrics.service';
import {
  ResourceSelectionService,
  SelectedAzureResource
} from '@services/azome/resource-selection.service';
import { ResourceGraphDialogService } from '@services/azome/resource-graph-dialog.service';

type MetricTimeRange = '1h' | '6h' | '24h' | '7d' | '30d';

interface MetricTimeRangeOption {
  value: MetricTimeRange;
  label: string;
  durationMs: number;
  interval: string;
}

interface MetricChart {
  resource: SelectedAzureResource;
  name: string;
  unit?: string;
  aggregation: MetricAggregation;
  points: AzureMetricDataPoint[];
  error?: string;
}

interface ResourceMetricGroup {
  resource: SelectedAzureResource;
  metrics: MetricChart[];
}

interface ResourceMetricDefinitions {
  resource: SelectedAzureResource;
  definitions: AzureMetricDefinition[];
  error?: string;
  unsupported?: boolean;
}

interface MetricQuery {
  resource: SelectedAzureResource;
  definition: AzureMetricDefinition;
  aggregation: MetricAggregation;
}

const TIME_RANGES: MetricTimeRangeOption[] = [
  { value: '1h', label: 'Last hour', durationMs: 60 * 60 * 1000, interval: 'PT1M' },
  { value: '6h', label: 'Last 6 hours', durationMs: 6 * 60 * 60 * 1000, interval: 'PT5M' },
  { value: '24h', label: 'Last 24 hours', durationMs: 24 * 60 * 60 * 1000, interval: 'PT15M' },
  { value: '7d', label: 'Last 7 days', durationMs: 7 * 24 * 60 * 60 * 1000, interval: 'PT1H' },
  { value: '30d', label: 'Last 30 days', durationMs: 30 * 24 * 60 * 60 * 1000, interval: 'PT1H' }
];

const METRIC_PROFILES: Record<string, string[]> = {
  'microsoft.storage/storageaccounts': [
    'UsedCapacity',
    'Transactions',
    'SuccessE2ELatency',
    'Availability'
  ],
  'microsoft.compute/virtualmachines': [
    'Percentage CPU',
    'Network In Total',
    'Network Out Total',
    'Disk Read Bytes',
    'Disk Write Bytes'
  ],
  'microsoft.web/sites': [
    'Requests',
    'Http5xx',
    'AverageResponseTime',
    'CpuTime',
    'MemoryWorkingSet'
  ],
  'microsoft.sql/servers/databases': [
    'cpu_percent',
    'dtu_consumption_percent',
    'storage_percent',
    'deadlock'
  ]
};

const AGGREGATIONS: MetricAggregation[] = ['Average', 'Maximum', 'Total', 'Count'];

const AUTOMATIC_METRICS_CONCURRENCY = 8;

@Component({
  selector: 'app-monitoring-metrics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './metrics.component.html',
  styleUrl: './metrics.component.scss'
})
export class MetricsComponent implements OnChanges, OnDestroy {
  @Input() resources: SelectedAzureResource[] = [];
  @Input() initialResource: SelectedAzureResource | null = null;
  @Input() initialResourceLoading = false;
  @Input() initialResourceError: string | null = null;

  public readonly timeRanges = TIME_RANGES;
  public readonly metricViews = ['auto', 'explorer'] as const;
  public metricView: (typeof this.metricViews)[number] = 'auto';
  public timeRange: MetricTimeRange = '24h';
  public selectedExplorerResourceIds: string[] = [];
  public selectedExplorerMetricNames: string[] = [];
  public selectedExplorerAggregation: MetricAggregation = 'Average';
  public automaticMetrics: MetricChart[] = [];
  public explorerMetrics: MetricChart[] = [];
  public explorerResourceDefinitions: ResourceMetricDefinitions[] = [];
  public automaticFailedResources: SelectedAzureResource[] = [];
  public automaticQueryError: string | null = null;
  public automaticErrorsDismissed = false;
  public explorerError: string | null = null;
  public loadingAutomaticMetrics = false;
  public automaticLoadedResourceCount = 0;
  public automaticTotalResourceCount = 0;
  public loadingExplorerDefinitions = false;
  public queryingExplorer = false;

  private readonly destroy$ = new Subject<void>();
  private automaticRequest?: Subscription;
  private explorerDefinitionsRequest?: Subscription;
  private explorerQueryRequest?: Subscription;
  private lastInitialResourceId: string | null = null;
  private excludedInitialResourceId: string | null = null;
  private readonly unsupportedMetricResourceErrors = new Map<string, string>();

  constructor(
    private readonly metrics: AzureMetricsService,
    private readonly resourceGraphDialog: ResourceGraphDialogService,
    private readonly resourceSelection: ResourceSelectionService
  ) {}

  /**
   * Reacts to input changes and refreshes the resource or metric selections.
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
        this.metricView = 'explorer';
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
        this.automaticMetrics = [];
        this.loadingAutomaticMetrics = false;
        this.loadExplorerDefinitions();
      } else {
        this.updateResourceSelection();
      }
    }

    if (changes['initialResourceError'] && this.initialResourceError) {
      this.explorerError = this.initialResourceError;
    }
  }

  /**
   * Cancels active subscriptions when the component is destroyed.
   */
  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Returns unique resources from the shared selection and linked-resource input.
   * @returns The available resources, deduplicated by resource ID.
   */
  public get availableResources(): SelectedAzureResource[] {
    const resources = new Map<string, SelectedAzureResource>();

    for (const resource of [...this.resources, ...(this.initialResource ? [this.initialResource] : [])]) {
      resources.set(resource.id.toLocaleLowerCase(), resource);
    }

    return Array.from(resources.values());
  }

  /**
   * Returns available resources currently selected for metric exploration.
   * @returns The selected Explorer resources.
   */
  public get explorerResources(): SelectedAzureResource[] {
    const selectedIds = new Set(this.selectedExplorerResourceIds.map((id) => id.toLocaleLowerCase()));

    return this.availableResources.filter((resource) =>
      selectedIds.has(resource.id.toLocaleLowerCase())
    );
  }

  /**
   * Checks whether every supported Explorer resource is selected.
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
   * Checks whether some, but not all, supported Explorer resources are selected.
   * @returns True when the selection is partial.
   */
  public get someExplorerResourcesSelected(): boolean {
    return this.selectableExplorerResources.some((resource) =>
      this.selectedExplorerResourceIds.some((id) =>
        id.toLocaleLowerCase() === resource.id.toLocaleLowerCase()
      )
    ) && !this.allExplorerResourcesSelected;
  }

  /**
   * Returns resources that have not been identified as unsupported for metrics.
   * @returns Resources that can be selected in the Explorer.
   */
  public get selectableExplorerResources(): SelectedAzureResource[] {
    return this.availableResources.filter((resource) =>
      !this.unsupportedMetricResourceErrors.has(resource.id.toLocaleLowerCase())
    );
  }

  /**
   * Finds the recorded unsupported-resource message for a resource.
   *
   * @param resourceId Azure resource ID to look up.
   * @returns The error message, or null when no unsupported-resource error is recorded.
   */
  public unsupportedResourceError(resourceId: string): string | null {
    return this.unsupportedMetricResourceErrors.get(resourceId.toLocaleLowerCase()) ?? null;
  }

  /**
   * Determines whether the Auto-Metrics error notice should be shown.
   * @returns True when an automatic metrics error exists and has not been dismissed.
   */
  public get showAutomaticErrors(): boolean {
    return !this.automaticErrorsDismissed
      && (this.automaticFailedResources.length > 0 || !!this.automaticQueryError);
  }

  /**
   * Hides the Auto-Metrics error notice until metrics are loaded again.
   */
  public dismissAutomaticErrors(): void {
    this.automaticErrorsDismissed = true;
  }

  /**
   * Groups metric charts by their resource ID while preserving input order.
   *
   * @param metrics Charts to group.
   * @returns One resource group per resource, containing its charts.
   */
  public groupMetrics(metrics: MetricChart[]): ResourceMetricGroup[] {
    const groups = new Map<string, ResourceMetricGroup>();

    for (const metric of metrics) {
      const key = metric.resource.id.toLocaleLowerCase();
      const group = groups.get(key) ?? { resource: metric.resource, metrics: [] };
      group.metrics.push(metric);
      groups.set(key, group);
    }

    return Array.from(groups.values());
  }

  /**
   * Returns metric definitions supported by every supported selected resource.
   * @returns Common metric definitions, or an empty array when none are available.
   */
  public get explorerMetricOptions(): AzureMetricDefinition[] {
    if (this.explorerResourceDefinitions.length === 0) {
      return [];
    }

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
    return this.supportedAggregations(firstDefinition).filter((aggregation) =>
      definitions.every((definition) =>
        definition !== undefined && this.supportedAggregations(definition).includes(aggregation)
      )
    );
  }

  /**
   * Changes the active metric view and loads automatic metrics when needed.
   *
   * @param view View to activate.
   */
  public selectMetricView(view: (typeof this.metricViews)[number]): void {
    this.metricView = view;

    if (view === 'auto' && this.initialResource && this.automaticMetrics.length === 0) {
      this.loadAutomaticMetrics();
    }
  }

  /**
   * Reloads automatic metrics or reruns the current Explorer query.
   */
  public refreshMetrics(): void {
    if (this.metricView === 'auto') {
      this.loadAutomaticMetrics();
    } else if (this.selectedExplorerMetricNames.length > 0 && this.explorerResources.length > 0) {
      this.queryExplorer();
    }
  }

  /**
   * Opens the resource graph query dialog.
   */
  public openResourceGraph(): void {
    this.resourceGraphDialog.requestOpen();
  }

  /**
   * Selects a supported time range and reloads the active metrics view. Ignores unsupported values.
   *
   * @param value Time-range option value.
   */
  public setTimeRange(value: string): void {
    const range = TIME_RANGES.find((option) => option.value === value);

    if (!range) {
      return;
    }

    this.timeRange = range.value;

    if (this.metricView === 'auto') {
      this.loadAutomaticMetrics();
    } else if (this.selectedExplorerMetricNames.length > 0) {
      this.queryExplorer();
    }
  }

  /**
   * Adds or removes one resource from the Explorer selection. Ignores unknown or unsupported ones.
   *
   * @param resourceId ID of the resource to toggle.
   * @param event Change event from the resource checkbox.
   */
  public toggleExplorerResource(resourceId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const resource = this.availableResources.find((item) =>
      item.id.toLocaleLowerCase() === resourceId.toLocaleLowerCase()
    );

    if (!resource) {
      return;
    }

    const normalizedId = resource.id.toLocaleLowerCase();

    if (this.unsupportedResourceError(resource.id)) {
      return;
    }

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

    this.selectedExplorerResourceIds = this.availableResources
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
   * Stores the selected metric names and updates the compatible aggregation.
   *
   * @param select Metric selector element containing the selected options.
   */
  public selectExplorerMetrics(select: HTMLSelectElement): void {
    this.selectedExplorerMetricNames = Array.from(select.selectedOptions)
      .map((option) => option.value);

    this.ensureExplorerAggregation();
  }

  /**
   * Keeps the selected Explorer aggregation valid, falling back to the first compatible option
   * or Average when needed.
   */
  private ensureExplorerAggregation(): void {
    const aggregations = this.explorerAggregationOptions;

    if (!aggregations.includes(this.selectedExplorerAggregation)) {
      this.selectedExplorerAggregation = aggregations[0] ?? 'Average';
    }
  }

  /**
   * Selects an aggregation only when all selected metrics support it. Ignores unsupported values.
   *
   * @param value Aggregation name to select.
   */
  public selectExplorerAggregation(value: string): void {
    const aggregation = AGGREGATIONS.find((option) => option === value);

    if (aggregation && this.explorerAggregationOptions.includes(aggregation)) {
      this.selectedExplorerAggregation = aggregation;
    }
  }

  /**
   * Queries selected metrics for selected resources and stores results or errors on the component.
   */
  public queryExplorer(): void {
    this.explorerQueryRequest?.unsubscribe();
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

    const range = this.selectedTimeRange();
    const end = new Date();
    const start = new Date(end.getTime() - range.durationMs);

    // Run each selected metric for every selected resource with the shared aggregation.
    const queries = resources.flatMap((resource) =>
      definitions.map((definition) => ({
        resource,
        definition,
        aggregation
      }))
    );

    this.queryingExplorer = true;
    this.explorerMetrics = [];
    this.explorerQueryRequest = this.queryMetrics(queries, start, end, range.interval)
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
   * Orders the aggregations supported by a metric, preferring its primary type.
   *
   * @param definition Metric definition to inspect.
   * @returns Supported aggregation names in preferred display order.
   */
  public supportedAggregations(definition: AzureMetricDefinition): MetricAggregation[] {
    const supported = new Set(
      (definition.supportedAggregationTypes ?? [])
        .map((aggregation) => this.toAggregation(aggregation))
        .filter((aggregation): aggregation is MetricAggregation => aggregation !== null)
    );
    const primary = this.toAggregation(definition.primaryAggregationType);

    if (supported.size === 0 && primary) {
      supported.add(primary);
    }

    const ordered = AGGREGATIONS.filter((aggregation) => supported.has(aggregation));

    if (primary && ordered.includes(primary)) {
      return [primary, ...ordered.filter((aggregation) => aggregation !== primary)];
    }

    return ordered;
  }

  /**
   * Reads the value corresponding to an aggregation from a metric data point.
   *
   * @param point Data point to read.
   * @param aggregation Aggregation whose value is requested.
   * @returns The aggregation value, or zero when that value is absent.
   */
  public metricValue(point: AzureMetricDataPoint, aggregation: MetricAggregation): number {
    switch (aggregation) {
      case 'Maximum':
        return point.maximum ?? 0;
      case 'Total':
        return point.total ?? 0;
      case 'Count':
        return point.count ?? 0;
      default:
        return point.average ?? 0;
    }
  }

  /**
   * Scales a metric point to a percentage of the chart's maximum value.
   *
   * @param chart Chart containing the point and comparison values.
   * @param point Point whose bar height is requested.
   * @returns Bar height as a percentage, with a 4% minimum for visible zero values.
   */
  public barHeight(chart: MetricChart, point: AzureMetricDataPoint): number {
    const maximum = Math.max(
      ...chart.points.map((item) => this.metricValue(item, chart.aggregation)),
      0
    );

    if (maximum === 0) {
      return 4;
    }

    return Math.max(
      4,
      (this.metricValue(point, chart.aggregation) / maximum) * 100
    );
  }

  /**
   * Formats a metric value using the current locale and at most two decimals.
   *
   * @param value Numeric metric value.
   * @returns Locale-formatted value.
   */
  public formatMetricValue(value: number): string {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  }

  /**
   * Rebuilds the Explorer resource selection and loads its definitions and metrics.
   */
  private updateResourceSelection(): void {
    this.selectedExplorerResourceIds = [
      ...this.resources.map((resource) => resource.id),
      ...(this.initialResource
        && this.excludedInitialResourceId !== this.initialResource.id.toLocaleLowerCase()
        ? [this.initialResource.id]
        : [])
    ];
    if (!this.initialResource || this.metricView === 'auto') {
      this.loadAutomaticMetrics();
    } else {
      this.automaticMetrics = [];
      this.loadingAutomaticMetrics = false;
    }

    this.loadExplorerDefinitions();
  }

  /**
   * Loads default metric charts for every available resource and stores progress, results, and
   * failures on the component.
   */
  private loadAutomaticMetrics(): void {
    this.automaticRequest?.unsubscribe();
    this.automaticMetrics = [];
    this.automaticFailedResources = [];
    this.automaticQueryError = null;
    this.automaticErrorsDismissed = false;

    const resources = this.availableResources;

    if (resources.length === 0) {
      this.loadingAutomaticMetrics = false;
      return;
    }

    this.loadingAutomaticMetrics = true;
    this.automaticLoadedResourceCount = 0;
    this.automaticTotalResourceCount = resources.length;

    const range = this.selectedTimeRange();
    const end = new Date();
    const start = new Date(end.getTime() - range.durationMs);
    const resourceOrder = new Map(
      resources.map((resource, index) => [resource.id.toLocaleLowerCase(), index])
    );

    // Each resource loads its definitions and metrics independently so cards render progressively.
    const resourceRequests = resources.map((resource) =>
      this.metrics.getMetricDefinitions(resource.id).pipe(
        map((metrics) =>
          this.selectDefaultMetrics(resource, metrics).map(({ definition, aggregation }) => ({
            resource,
            definition,
            aggregation
          }))
        ),
        switchMap((queries) =>
          queries.length > 0
            ? this.queryMetrics(queries, start, end, range.interval)
            : of([])
        ),
        catchError((error: unknown) => {
          console.error(`Failed to load metric definitions for ${resource.id}:`, error);

          const errorMessage = this.errorMessage(error, 'Metric definitions could not be loaded.');

          if (this.isUnsupportedMetricResourceError(errorMessage, resource.type)) {
            this.unsupportedMetricResourceErrors.set(
              resource.id.toLocaleLowerCase(),
              errorMessage
            );
          }

          this.automaticFailedResources = [...this.automaticFailedResources, resource];
          return of([] as MetricChart[]);
        })
      )
    );

    this.automaticRequest = from(resourceRequests).pipe(
      mergeMap((request) => request, AUTOMATIC_METRICS_CONCURRENCY),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (results) => {
        this.automaticLoadedResourceCount++;
        if (results.length > 0) {
          this.automaticMetrics = [...this.automaticMetrics, ...results].sort((first, second) =>
            (resourceOrder.get(first.resource.id.toLocaleLowerCase()) ?? 0)
            - (resourceOrder.get(second.resource.id.toLocaleLowerCase()) ?? 0)
          );
        }
      },
      complete: () => {
        this.loadingAutomaticMetrics = false;
      },
      error: (error: unknown) => {
        console.error('Failed to query default Azure Monitor metrics:', error);
        this.automaticQueryError = this.errorMessage(
          error,
          'Default metrics could not be queried.'
        ).split(', supported ones are')[0];
        this.loadingAutomaticMetrics = false;
      }
    });
  }

  /**
   * Loads metric definitions for selected Explorer resources and stores definitions and errors.
   */
  private loadExplorerDefinitions(): void {
    this.explorerDefinitionsRequest?.unsubscribe();
    this.explorerResourceDefinitions = [];
    this.explorerMetrics = [];
    this.explorerError = null;

    const resources = this.explorerResources;

    if (resources.length === 0) {
      this.loadingExplorerDefinitions = false;
      return;
    }

    this.loadingExplorerDefinitions = true;

    const requests: Observable<ResourceMetricDefinitions>[] = resources.map((resource) => {
      return this.metrics.getMetricDefinitions(resource.id).pipe(
        map((definitions): ResourceMetricDefinitions => ({ resource, definitions })),
        catchError((error: unknown): Observable<ResourceMetricDefinitions> => {
          console.error(`Failed to load metric definitions for ${resource.id}:`, error);

          const errorMessage = this.errorMessage(
            error,
            'Metric definitions could not be loaded.'
          );
          const unsupported = this.isUnsupportedMetricResourceError(errorMessage, resource.type);
          if (unsupported) {
            this.unsupportedMetricResourceErrors.set(
              resource.id.toLocaleLowerCase(),
              errorMessage
            );
          }
          return of({
            resource,
            definitions: [],
            error: errorMessage,
            unsupported
          });
        })
      );
    });

    this.explorerDefinitionsRequest = forkJoin(requests)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results) => {
          this.explorerResourceDefinitions = results;

          const unsupportedIds = new Set(
            results
              .filter((result) => result.unsupported)
              .map((result) => result.resource.id.toLocaleLowerCase())
          );

          // Remove unsupported resources before deriving the common metric choices.
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
          this.explorerError = this.errorMessage(error, 'Metric definitions could not be loaded.');
          this.loadingExplorerDefinitions = false;
        }
      });
  }

  /**
   * Runs metric queries and converts successes or individual failures into charts.
   *
   * @param queries Resource, metric, and aggregation combinations to query.
   * @param start Inclusive beginning of the requested time range.
   * @param end End of the requested time range.
   * @param interval Preferred Azure Monitor time grain.
   * @returns An observable that emits one chart per query.
   */
  private queryMetrics(
    queries: MetricQuery[],
    start: Date,
    end: Date,
    interval: string
  ): Observable<MetricChart[]> {
    return forkJoin(queries.map((query) =>
      this.metrics.getMetric(
        query.resource.id,
        query.definition.name.value,
        query.aggregation,
        start,
        end,
        this.intervalFor(query.definition, interval)
      ).pipe(
        map((result) => ({
          resource: query.resource,
          name: result.name,
          unit: result.unit ?? query.definition.unit,
          aggregation: query.aggregation,
          points: result.data
        })),
        catchError((error: unknown) => {
          console.error(
            `Failed to query metric ${query.definition.name.value} for ${query.resource.id}:`,
            error
          );
          return of({
            resource: query.resource,
            name: query.definition.name.localizedValue ?? query.definition.name.value,
            unit: query.definition.unit,
            aggregation: query.aggregation,
            points: [],
            error: this.errorMessage(error, 'Metric query failed.')
          });
        })
      )
    ));
  }

  /**
   * Chooses preferred metrics for a resource, then fills remaining slots from its definitions.
   *
   * @param resource Resource whose metric profile is used.
   * @param definitions Definitions available for that resource.
   * @returns Up to five supported metric and aggregation pairs.
   */
  private selectDefaultMetrics(
    resource: SelectedAzureResource,
    definitions: AzureMetricDefinition[]
  ): Array<{ definition: AzureMetricDefinition; aggregation: MetricAggregation }> {
    const type = resource.type.toLocaleLowerCase();
    const profile = METRIC_PROFILES[type];
    const available = new Map(
      definitions.map((definition) => [definition.name.value.toLocaleLowerCase(), definition])
    );

    // Prioritize metrics named by the resource profile before filling remaining slots.
    const preferred = (profile ?? [])
      .map((name) => available.get(name.toLocaleLowerCase()))
      .filter((definition): definition is AzureMetricDefinition => definition !== undefined);
    const preferredNames = new Set(
      preferred.map((definition) => definition.name.value.toLocaleLowerCase())
    );
    const candidates = profile
      ? [...preferred, ...definitions.filter((definition) =>
        !preferredNames.has(definition.name.value.toLocaleLowerCase())
      )].slice(0, 5)
      : definitions.slice(0, 4);

    return candidates.flatMap((definition) => {
      const aggregation = this.supportedAggregations(definition)[0];

      return aggregation ? [{ definition, aggregation }] : [];
    });
  }

  /**
   * Resolves the selected time-range configuration.
   * @returns The matching range, or the 24-hour range if the selection is invalid.
   */
  private selectedTimeRange(): MetricTimeRangeOption {
    return TIME_RANGES.find((range) => range.value === this.timeRange) ?? TIME_RANGES[2];
  }

  /**
   * Chooses a time grain supported by a metric, using the requested grain when possible.
   *
   * @param definition Metric whose available time grains are inspected.
   * @param preferred Requested time grain.
   * @returns A supported time grain, or the requested grain when availability is unknown.
   */
  private intervalFor(definition: AzureMetricDefinition, preferred: string): string {
    const available = (definition.metricAvailabilities ?? [])
      .map((availability) => availability.timeGrain)
      .filter((timeGrain): timeGrain is string => Boolean(timeGrain))
      .map((timeGrain) => ({ timeGrain, duration: this.timeGrainDuration(timeGrain) }))
      .filter((entry): entry is { timeGrain: string; duration: number } =>
        entry.duration !== null
      )
      .sort((first, second) => first.duration - second.duration);

    if (available.length === 0 || available.some((entry) => entry.timeGrain === preferred)) {
      return preferred;
    }

    const preferredDuration = this.timeGrainDuration(preferred);

    // Prefer a grain at least as long as requested, then fall back to the coarsest available grain.
    return available.find((entry) => entry.duration >= (preferredDuration ?? 0))?.timeGrain
      ?? available[available.length - 1].timeGrain;
  }

  /**
   * Converts an ISO 8601 duration time grain to milliseconds.
   *
   * @param timeGrain Duration string to parse.
   * @returns Duration in milliseconds, or null when the string is invalid or zero.
   */
  private timeGrainDuration(timeGrain: string): number | null {
    const parts = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(timeGrain);

    if (!parts) {
      return null;
    }

    const days = Number(parts[1] ?? 0);
    const hours = Number(parts[2] ?? 0);
    const minutes = Number(parts[3] ?? 0);
    const seconds = Number(parts[4] ?? 0);
    const duration = (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;

    return duration > 0 ? duration : null;
  }

  /**
   * Resolves a case-insensitive value to a supported metric aggregation.
   *
   * @param value Aggregation value to resolve.
   * @returns The supported aggregation, or null when it is unknown.
   */
  private toAggregation(value?: string): MetricAggregation | null {
    return AGGREGATIONS.find((aggregation) => aggregation.toLowerCase() === value?.toLowerCase())
      ?? null;
  }

  /**
   * Extracts a useful message from an HTTP or JavaScript error.
   *
   * @param error Error value to inspect.
   * @param fallback Message to use when the error has no readable detail.
   * @returns The extracted message or fallback text.
   */
  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const responseError: unknown = error.error;

      if (responseError && typeof responseError === 'object') {
        // HTTP error payloads may wrap the actual message in an `error` object.
        const nestedError = 'error' in responseError
          && responseError.error
          && typeof responseError.error === 'object'
          ? responseError.error
          : responseError;

        if ('message' in nestedError && typeof nestedError.message === 'string') {
          return nestedError.message;
        }
      }
    }

    return error instanceof Error && error.message ? error.message : fallback;
  }

  /**
   * Checks whether an error specifically reports an unsupported resource type.
   *
   * @param errorMessage Message returned by Azure Monitor.
   * @param resourceType Azure resource type to match.
   * @returns True when the message names the type and reports it as unsupported.
   */
  private isUnsupportedMetricResourceError(errorMessage: string, resourceType: string): boolean {
    const normalizedMessage = errorMessage.toLocaleLowerCase();

    return normalizedMessage.includes(resourceType.toLocaleLowerCase())
      && /\bnot a supported\b|\bis not supported\b/.test(normalizedMessage);
  }
}
