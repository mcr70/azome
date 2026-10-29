import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { forkJoin, Observable, of, Subject, Subscription } from 'rxjs';
import { catchError, map, switchMap, takeUntil } from 'rxjs/operators';
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
  public automaticErrors: string[] = [];
  public explorerError: string | null = null;
  public loadingAutomaticMetrics = false;
  public loadingExplorerDefinitions = false;
  public queryingExplorer = false;

  private readonly destroy$ = new Subject<void>();
  private automaticRequest?: Subscription;
  private explorerDefinitionsRequest?: Subscription;
  private explorerQueryRequest?: Subscription;
  private lastInitialResourceId: string | null = null;
  private excludedInitialResourceId: string | null = null;

  constructor(
    private readonly metrics: AzureMetricsService,
    private readonly resourceGraphDialog: ResourceGraphDialogService,
    private readonly resourceSelection: ResourceSelectionService
  ) {}

  public ngOnChanges(changes: SimpleChanges): void {
    let linkedResourceChanged = false;

    if (changes['initialResource']) {
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

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public get availableResources(): SelectedAzureResource[] {
    const resources = new Map<string, SelectedAzureResource>();

    for (const resource of [...this.resources, ...(this.initialResource ? [this.initialResource] : [])]) {
      resources.set(resource.id.toLocaleLowerCase(), resource);
    }

    return Array.from(resources.values());
  }

  public get explorerResources(): SelectedAzureResource[] {
    const selectedIds = new Set(this.selectedExplorerResourceIds.map((id) => id.toLocaleLowerCase()));
    return this.availableResources.filter((resource) =>
      selectedIds.has(resource.id.toLocaleLowerCase())
    );
  }

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

  public get explorerMetricOptions(): AzureMetricDefinition[] {
    if (this.explorerResourceDefinitions.length === 0) {
      return [];
    }

    const definitions = this.explorerResourceDefinitions[0].definitions;
    const commonNames = new Set(
      definitions.map((definition) => definition.name.value.toLocaleLowerCase())
    );

    for (const resource of this.explorerResourceDefinitions.slice(1)) {
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

    return this.supportedAggregations(firstDefinition).filter((aggregation) =>
      definitions.every((definition) =>
        definition !== undefined && this.supportedAggregations(definition).includes(aggregation)
      )
    );
  }

  public selectMetricView(view: (typeof this.metricViews)[number]): void {
    this.metricView = view;

    if (view === 'auto' && this.initialResource && this.automaticMetrics.length === 0) {
      this.loadAutomaticMetrics();
    }
  }

  public refreshMetrics(): void {
    if (this.metricView === 'auto') {
      this.loadAutomaticMetrics();
    } else if (this.selectedExplorerMetricNames.length > 0 && this.explorerResources.length > 0) {
      this.queryExplorer();
    }
  }

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

  public toggleExplorerResource(resourceId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const resource = this.availableResources.find((item) =>
      item.id.toLocaleLowerCase() === resourceId.toLocaleLowerCase()
    );

    if (!resource) {
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

    this.selectedExplorerResourceIds = this.availableResources
      .filter((item) => selectedIds.has(item.id.toLocaleLowerCase()))
      .map((item) => item.id);
    this.loadExplorerDefinitions();
  }

  public openResourceGraph(): void {
    this.resourceGraphDialog.requestOpen();
  }

  public selectExplorerMetrics(select: HTMLSelectElement): void {
    this.selectedExplorerMetricNames = Array.from(select.selectedOptions)
      .map((option) => option.value);
    this.ensureExplorerAggregation();
  }

  private ensureExplorerAggregation(): void {
    const aggregations = this.explorerAggregationOptions;

    if (!aggregations.includes(this.selectedExplorerAggregation)) {
      this.selectedExplorerAggregation = aggregations[0] ?? 'Average';
    }
  }

  public selectExplorerAggregation(value: string): void {
    const aggregation = AGGREGATIONS.find((option) => option === value);

    if (aggregation && this.explorerAggregationOptions.includes(aggregation)) {
      this.selectedExplorerAggregation = aggregation;
    }
  }

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

  public formatMetricValue(value: number): string {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  }

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

  private loadAutomaticMetrics(): void {
    this.automaticRequest?.unsubscribe();
    this.automaticMetrics = [];
    this.automaticErrors = [];

    const resources = this.availableResources;
    if (resources.length === 0) {
      this.loadingAutomaticMetrics = false;
      return;
    }

    this.loadingAutomaticMetrics = true;
    const definitions = resources.map((resource) =>
      this.metrics.getMetricDefinitions(resource.id).pipe(
        map((metrics) => ({
          resource,
          metrics: this.selectDefaultMetrics(resource, metrics)
        })),
        catchError((error: unknown) => {
          console.error(`Failed to load metric definitions for ${resource.id}:`, error);
          this.automaticErrors.push(
            `${resource.name}: ${this.errorMessage(error, 'Metric definitions could not be loaded.')}`
          );
          return of({ resource, metrics: [] });
        })
      )
    );

    this.automaticRequest = forkJoin(definitions).pipe(
      switchMap((groups) => {
        const range = this.selectedTimeRange();
        const end = new Date();
        const start = new Date(end.getTime() - range.durationMs);
        const queries = groups.flatMap(({ resource, metrics }) =>
          metrics.map(({ definition, aggregation }) => ({ resource, definition, aggregation }))
        );

        return queries.length > 0
          ? this.queryMetrics(queries, start, end, range.interval)
          : of([]);
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (results) => {
        this.automaticMetrics = results;
        this.loadingAutomaticMetrics = false;
      },
      error: (error: unknown) => {
        console.error('Failed to query default Azure Monitor metrics:', error);
        this.automaticErrors.push(
          this.errorMessage(error, 'Default metrics could not be queried.')
        );
        this.loadingAutomaticMetrics = false;
      }
    });
  }

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
          return of({
            resource,
            definitions: [],
            error: this.errorMessage(error, 'Metric definitions could not be loaded.')
          });
        })
      );
    });

    this.explorerDefinitionsRequest = forkJoin(requests)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (results) => {
          this.explorerResourceDefinitions = results;
          const availableNames = new Set(
            this.explorerMetricOptions.map((metric) => metric.name.value)
          );
          this.selectedExplorerMetricNames = this.selectedExplorerMetricNames
            .filter((name) => availableNames.has(name));

          this.ensureExplorerAggregation();
          this.explorerError = results.find((result) => result.error)?.error ?? null;
          this.loadingExplorerDefinitions = false;
        },
        error: (error: unknown) => {
          console.error('Failed to load metric explorer definitions:', error);
          this.explorerError = this.errorMessage(error, 'Metric definitions could not be loaded.');
          this.loadingExplorerDefinitions = false;
        }
      });
  }

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

  private selectDefaultMetrics(
    resource: SelectedAzureResource,
    definitions: AzureMetricDefinition[]
  ): Array<{ definition: AzureMetricDefinition; aggregation: MetricAggregation }> {
    const type = resource.type.toLocaleLowerCase();
    const profile = METRIC_PROFILES[type];
    const available = new Map(
      definitions.map((definition) => [definition.name.value.toLocaleLowerCase(), definition])
    );
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

  private selectedTimeRange(): MetricTimeRangeOption {
    return TIME_RANGES.find((range) => range.value === this.timeRange) ?? TIME_RANGES[2];
  }

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
    return available.find((entry) => entry.duration >= (preferredDuration ?? 0))?.timeGrain
      ?? available[available.length - 1].timeGrain;
  }

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

  private toAggregation(value?: string): MetricAggregation | null {
    return AGGREGATIONS.find((aggregation) => aggregation.toLowerCase() === value?.toLowerCase())
      ?? null;
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}
