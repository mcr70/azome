import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { from, of, Subject, Subscription } from 'rxjs';
import { catchError, map, mergeMap, switchMap, takeUntil } from 'rxjs/operators';
import { SelectedAzureResource } from '@services/azome/resource-selection.service';
import {
  MetricTimeRange,
  MetricChart,
  MetricQuery,
  ResourceMetricGroup
} from './metrics.model';
import { MetricsSupportService } from './metrics-support.service';
import { MetricChartComponent } from '@components/metric-chart/metric-chart.component';
import { MetricAggregation } from '@services/azure/azure-metrics.service';

export type MetricProfileEntry = string | string[];

export interface MetricChartCard {
  id: string;
  title: string;
  subtitle: string;
  series: MetricChart[];
  error?: string;
}

export interface AutomaticMetricGroup extends ResourceMetricGroup {
  cards: MetricChartCard[];
}

const METRIC_PROFILES: Record<string, MetricProfileEntry[]> = {
  'microsoft.storage/storageaccounts': [
    'UsedCapacity',
    'Transactions',
    'SuccessE2ELatency',
    ['Ingress', 'Egress']
  ],
  'microsoft.compute/virtualmachines': [
    'Percentage CPU',
    ['Network In Total', 'Network Out Total'],
    ['Disk Read Bytes', 'Disk Write Bytes']
  ],
  'microsoft.web/sites': [
    'Requests',
    'Http5xx',
    ['AverageResponseTime', 'CpuTime'],
    'MemoryWorkingSet'
  ],
  'microsoft.sql/servers/databases': [
    'cpu_percent',
    'dtu_consumption_percent',
    'storage_percent'
  ]
};

// Function apps share the microsoft.web/sites type but emit execution metrics
// instead of meaningful HTTP metrics (e.g. timer/queue triggered functions).
const FUNCTION_APP_PROFILE: MetricProfileEntry[] = [
  'FunctionExecutionCount',
  'FunctionExecutionUnits',
  'Requests',
  'Http5xx',
  'MemoryWorkingSet'
];

const AUTOMATIC_METRICS_CONCURRENCY = 8;

@Component({
  selector: 'app-auto-metrics',
  standalone: true,
  imports: [CommonModule, MetricChartComponent],
  templateUrl: './auto-metrics.component.html',
  styleUrls: ['./metrics-shared.scss', './auto-metrics.component.scss']
})
export class AutoMetricsComponent implements OnChanges, OnDestroy {
  @Input() resources: SelectedAzureResource[] = [];
  @Input() timeRange: MetricTimeRange = '24h';
  @Input() active = false;

  public automaticMetrics: MetricChart[] = [];
  public automaticMetricGroups: AutomaticMetricGroup[] = [];
  public automaticFailedResources: SelectedAzureResource[] = [];
  public automaticQueryError: string | null = null;
  public automaticErrorsDismissed = false;
  public loadingAutomaticMetrics = false;
  public automaticLoadedResourceCount = 0;
  public automaticTotalResourceCount = 0;

  private readonly destroy$ = new Subject<void>();
  private automaticRequest?: Subscription;

  constructor(public readonly metricsSupport: MetricsSupportService) {}

  /**
   * Reloads automatic metrics when the active view's resources or range changes.
   *
   * @param changes Angular input changes for this component.
   */
  public ngOnChanges(changes: SimpleChanges): void {
    const inputsChanged = changes['resources'] || changes['timeRange'] || changes['active'];

    if (this.active && inputsChanged) {
      this.loadAutomaticMetrics();
    }
  }

  /**
   * Cancels active metric requests when the component is destroyed.
   */
  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.automaticRequest?.unsubscribe();
  }

  /**
   * Tells whether the automatic-metrics error notice should be shown.
   */
  public get showAutomaticErrors(): boolean {
    return !this.automaticErrorsDismissed
      && (this.automaticFailedResources.length > 0 || !!this.automaticQueryError);
  }

  /**
   * Reloads the automatic metrics for the current inputs.
   */
  public refreshMetrics(): void {
    this.loadAutomaticMetrics();
  }

  /**
   * Hides the automatic-metrics error notice until the next reload.
   */
  public dismissAutomaticErrors(): void {
    this.automaticErrorsDismissed = true;
  }

  /**
   * Builds chart cards for a resource, grouping array entries in the profile into a single chart.
   */
  public buildResourceCards(
    resourceMetrics: MetricChart[],
    resourceType: string,
    definitions?: import('@services/azure/azure-metrics.service').AzureMetricDefinition[]
  ): MetricChartCard[] {
    const profile = this.resolveProfile(resourceType, definitions);
    const remaining = [...resourceMetrics];
    const cards: MetricChartCard[] = [];

    const takeMetricByName = (name: string): MetricChart | undefined => {
      const target = name.toLocaleLowerCase();
      const idx = remaining.findIndex(
        (m) => (m.name ?? '').toLocaleLowerCase() === target
      );
      if (idx === -1) {
        return undefined;
      }
      const [found] = remaining.splice(idx, 1);
      return found;
    };

    (profile ?? []).forEach((entry, entryIndex) => {
      if (Array.isArray(entry)) {
        const matchedSeries = entry
          .map((name) => takeMetricByName(name))
          .filter((m): m is MetricChart => m !== undefined);

        if (matchedSeries.length > 0) {
          cards.push(this.createCard(`group-${entryIndex}`, matchedSeries, entry.join(' · ')));
        }
      } else {
        const metric = takeMetricByName(entry);
        if (metric) {
          cards.push(this.createCard(`single-${entryIndex}-${metric.name}`, [metric], metric.name));
        }
      }
    });

    remaining.forEach((metric, idx) => {
      cards.push(this.createCard(`extra-${idx}-${metric.name}`, [metric], metric.name));
    });

    return cards;
  }

  /**
   * Returns true if any series in the card has data points.
   */
  public hasAnyPoints(series: MetricChart[]): boolean {
    return series.some((s) => Array.isArray(s.points) && s.points.length > 0);
  }

  private createCard(id: string, series: MetricChart[], fallbackTitle: string): MetricChartCard {
    const error = series.map((s) => s.error).find((e): e is string => Boolean(e));
    const aggregations = Array.from(
      new Set(
        series
          .map((s) => s.aggregation)
          .filter((a): a is MetricAggregation => Boolean(a))
      )
    );
    const subtitle = aggregations.length === 1
      ? aggregations[0]
      : `${series.length} series`;

    const title = series.length === 1 ? (series[0].name || fallbackTitle) : fallbackTitle;

    return {
      id,
      title,
      subtitle,
      series,
      error
    };
  }

  private resolveProfile(
    resourceType: string,
    definitions?: import('@services/azure/azure-metrics.service').AzureMetricDefinition[]
  ): MetricProfileEntry[] | undefined {
    const type = resourceType.toLocaleLowerCase();
    const hasFunctionExecution = definitions?.some(
      (d) => d.name?.value?.toLocaleLowerCase() === 'functionexecutioncount'
    );

    if (type === 'microsoft.web/sites' && hasFunctionExecution) {
      return FUNCTION_APP_PROFILE;
    }

    return METRIC_PROFILES[type];
  }

  /** Rebuilds grouped chart data after the automatic metrics change. */
  private updateAutomaticMetricGroups(): void {
    this.automaticMetricGroups = this.metricsSupport
      .groupMetrics(this.automaticMetrics)
      .map((group) => ({
        ...group,
        cards: this.buildResourceCards(group.metrics, group.resource.type)
      }));
  }

  /**
   * Loads default metric charts for every available resource.
   */
  private loadAutomaticMetrics(): void {
    this.automaticRequest?.unsubscribe();
    this.automaticMetrics = [];
    this.automaticMetricGroups = [];
    this.automaticFailedResources = [];
    this.automaticQueryError = null;
    this.automaticErrorsDismissed = false;

    const resources = this.resources;

    if (resources.length === 0) {
      this.loadingAutomaticMetrics = false;
      return;
    }

    this.loadingAutomaticMetrics = true;
    this.automaticLoadedResourceCount = 0;
    this.automaticTotalResourceCount = resources.length;

    const range = this.metricsSupport.timeRange(this.timeRange);
    const end = new Date();
    const start = new Date(end.getTime() - range.durationMs);
    const resourceOrder = new Map(
      resources.map((resource, index) => [resource.id.toLocaleLowerCase(), index])
    );

    // Independent resource requests let completed cards render while other resources load.
    const resourceRequests = resources.map((resource) =>
      this.metricsSupport.getMetricDefinitions(resource.id).pipe(
        map((definitions) =>
          this.selectDefaultMetrics(resource, definitions).map(({ definition, aggregation }) => ({
            resource,
            definition,
            aggregation
          }))
        ),
        switchMap((queries) =>
          queries.length > 0
            ? this.metricsSupport.queryMetrics(queries, start, end, range.interval)
            : of([] as MetricChart[])
        ),
        catchError((error: unknown) => {
          console.error(`Failed to load metric definitions for ${resource.id}:`, error);
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
          this.updateAutomaticMetricGroups();
        }
      },
      complete: () => {
        this.loadingAutomaticMetrics = false;
      },
      error: (error: unknown) => {
        console.error('Failed to query default Azure Monitor metrics:', error);
        this.automaticQueryError = this.metricsSupport.errorMessage(
          error,
          'Default metrics could not be queried.'
        ).split(', supported ones are')[0];
        this.loadingAutomaticMetrics = false;
      }
    });
  }

  /**
   * Selects preferred metrics for a resource, then fills remaining slots from available definitions.
   *
   * @param resource Resource whose metric profile is used.
   * @param definitions Definitions available for that resource.
   * @returns Up to five supported metric and aggregation pairs.
   */
  private selectDefaultMetrics(
    resource: SelectedAzureResource,
    definitions: import('@services/azure/azure-metrics.service').AzureMetricDefinition[]
  ): MetricQuery[] {
    const type = resource.type.toLocaleLowerCase();
    const available = new Map(
      definitions.map((definition) => [definition.name.value.toLocaleLowerCase(), definition])
    );

    // Only function apps expose FunctionExecutionCount, so its presence
    // distinguishes them from regular web apps of the same resource type.
    const profile = type === 'microsoft.web/sites' && available.has('functionexecutioncount')
      ? FUNCTION_APP_PROFILE
      : METRIC_PROFILES[type];

    const flattenedProfile = (profile ?? []).flat();

    const preferred = flattenedProfile
      .map((name) => available.get(name.toLocaleLowerCase()))
      .filter((definition): definition is import('@services/azure/azure-metrics.service').AzureMetricDefinition =>
        definition !== undefined
      );
    const preferredNames = new Set(
      preferred.map((definition) => definition.name.value.toLocaleLowerCase())
    );
    const maxSlots = Math.max(5, flattenedProfile.length);
    const candidates = profile
      ? [...preferred, ...definitions.filter((definition) =>
        !preferredNames.has(definition.name.value.toLocaleLowerCase())
      )].slice(0, maxSlots)
      : definitions.slice(0, 4);

    return candidates.flatMap((definition) => {
      const aggregation = this.metricsSupport.supportedAggregations(definition)[0];

      return aggregation ? [{ resource, definition, aggregation }] : [];
    });
  }
}
