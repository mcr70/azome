import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { from, of, Subject, Subscription } from 'rxjs';
import { catchError, map, mergeMap, switchMap, takeUntil } from 'rxjs/operators';
import { SelectedAzureResource } from '@services/azome/resource-selection.service';
import { MetricTimeRange } from './metrics.model';
import { MetricsSupportService } from './metrics-support.service';
import { MetricChart, MetricQuery } from './metrics.model';

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

const AUTOMATIC_METRICS_CONCURRENCY = 8;

@Component({
  selector: 'app-auto-metrics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './auto-metrics.component.html',
  styleUrls: ['./metrics-shared.scss', './auto-metrics.component.scss']
})
export class AutoMetricsComponent implements OnChanges, OnDestroy {
  @Input() resources: SelectedAzureResource[] = [];
  @Input() timeRange: MetricTimeRange = '24h';
  @Input() active = false;

  public automaticMetrics: MetricChart[] = [];
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
   * Loads default metric charts for every available resource.
   */
  private loadAutomaticMetrics(): void {
    this.automaticRequest?.unsubscribe();
    this.automaticMetrics = [];
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
    const profile = METRIC_PROFILES[type];
    const available = new Map(
      definitions.map((definition) => [definition.name.value.toLocaleLowerCase(), definition])
    );

    const preferred = (profile ?? [])
      .map((name) => available.get(name.toLocaleLowerCase()))
      .filter((definition): definition is import('@services/azure/azure-metrics.service').AzureMetricDefinition =>
        definition !== undefined
      );
    const preferredNames = new Set(
      preferred.map((definition) => definition.name.value.toLocaleLowerCase())
    );
    const candidates = profile
      ? [...preferred, ...definitions.filter((definition) =>
        !preferredNames.has(definition.name.value.toLocaleLowerCase())
      )].slice(0, 5)
      : definitions.slice(0, 4);

    return candidates.flatMap((definition) => {
      const aggregation = this.metricsSupport.supportedAggregations(definition)[0];

      return aggregation ? [{ resource, definition, aggregation }] : [];
    });
  }
}
