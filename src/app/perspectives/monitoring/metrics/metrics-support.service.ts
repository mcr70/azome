import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  AzureMetricDataPoint,
  AzureMetricDefinition,
  AzureMetricsService,
  MetricAggregation
} from '@services/azure/azure-metrics.service';
import {
  MetricChart,
  MetricQuery,
  MetricTimeRange,
  MetricTimeRangeOption,
  ResourceMetricGroup,
  TIME_RANGES,
  METRIC_AGGREGATIONS
} from './metrics.model';

@Injectable({ providedIn: 'root' })
export class MetricsSupportService {
  constructor(private readonly metrics: AzureMetricsService) {}

  /**
   * Loads metric definitions for one Azure resource.
   *
   * @param resourceId Azure resource ID to query.
   * @returns An observable of the metric definitions.
   */
  public getMetricDefinitions(resourceId: string): Observable<AzureMetricDefinition[]> {
    return this.metrics.getMetricDefinitions(resourceId);
  }

  /**
   * Resolves the selected time-range configuration.
   *
   * @param value Selected range identifier.
   * @returns The matching range, or the 24-hour range when the value is invalid.
   */
  public timeRange(value: MetricTimeRange): MetricTimeRangeOption {
    return TIME_RANGES.find((range) => range.value === value) ?? TIME_RANGES[2];
  }

  /**
   * Groups metric charts by resource ID while preserving their input order.
   *
   * @param charts Metric charts to group.
   * @returns One group per resource, containing that resource's charts.
   */
  public groupMetrics(charts: MetricChart[]): ResourceMetricGroup[] {
    const groups = new Map<string, ResourceMetricGroup>();

    for (const chart of charts) {
      const key = chart.resource.id.toLocaleLowerCase();
      const group = groups.get(key) ?? { resource: chart.resource, metrics: [] };
      group.metrics.push(chart);
      groups.set(key, group);
    }

    return Array.from(groups.values());
  }

  /**
   * Returns supported aggregations with the primary aggregation first.
   *
   * @param definition Metric definition to inspect.
   * @returns Supported aggregations in preferred order.
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

    const ordered = METRIC_AGGREGATIONS.filter((aggregation) => supported.has(aggregation));

    if (primary && ordered.includes(primary)) {
      return [primary, ...ordered.filter((aggregation) => aggregation !== primary)];
    }

    return ordered;
  }

  /**
   * Reads the value matching an aggregation from a metric data point.
   *
   * @param point Data point to read.
   * @param aggregation Aggregation whose value is requested.
   * @returns The value, or zero when it is absent.
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
   * @param chart Chart containing the comparison values.
   * @param point Point whose bar height is requested.
   * @returns Bar height percentage, with a 4% minimum for visibility.
   */
  public barHeight(chart: MetricChart, point: AzureMetricDataPoint): number {
    const maximum = Math.max(
      ...chart.points.map((item) => this.metricValue(item, chart.aggregation)),
      0
    );

    if (maximum === 0) {
      return 4;
    }

    return Math.max(4, (this.metricValue(point, chart.aggregation) / maximum) * 100);
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
   * Runs metric queries and converts individual failures into chart errors.
   *
   * @param queries Resource, metric, and aggregation combinations to query.
   * @param start Inclusive beginning of the requested time range.
   * @param end End of the requested time range.
   * @param interval Preferred Azure Monitor time grain.
   * @returns An observable that emits one chart per query.
   */
  public queryMetrics(
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
   * Chooses a time grain supported by a metric, preferring the requested grain.
   *
   * @param definition Metric whose time grains are inspected.
   * @param preferred Requested time grain.
   * @returns A supported grain, or the requested grain when availability is unknown.
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

    // Prefer a grain at least as long as requested, then use the coarsest available grain.
    return available.find((entry) => entry.duration >= (preferredDuration ?? 0))?.timeGrain
      ?? available[available.length - 1].timeGrain;
  }

  /**
   * Extracts a useful message from an HTTP or JavaScript error.
   *
   * @param error Error value to inspect.
   * @param fallback Message to use when no detail is available.
   * @returns The extracted message or fallback text.
   */
  public errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const responseError: unknown = error.error;

      if (responseError && typeof responseError === 'object') {
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
   * Checks whether Azure Monitor reports a resource type as unsupported.
   *
   * @param message Error message to inspect.
   * @param resourceType Azure resource type to match.
   * @returns True when the message identifies the type as unsupported.
   */
  public isUnsupportedResourceError(message: string, resourceType: string): boolean {
    const normalizedMessage = message.toLocaleLowerCase();

    return normalizedMessage.includes(resourceType.toLocaleLowerCase())
      && /\bnot a supported\b|\bis not supported\b/.test(normalizedMessage);
  }

  /**
   * Converts an ISO 8601 duration to milliseconds.
   *
   * @param timeGrain Duration string to parse.
   * @returns Duration in milliseconds, or null when invalid or zero.
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
   * Resolves a case-insensitive value to a supported aggregation.
   *
   * @param value Aggregation value to resolve.
   * @returns Supported aggregation, or null when unknown.
   */
  private toAggregation(value?: string): MetricAggregation | null {
    return METRIC_AGGREGATIONS.find((aggregation) =>
      aggregation.toLowerCase() === value?.toLowerCase()
    ) ?? null;
  }
}
