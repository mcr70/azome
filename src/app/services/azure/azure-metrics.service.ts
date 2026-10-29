import { Injectable } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';
import { ArmApiService } from './arm-api.service';

export type MetricAggregation = 'Average' | 'Maximum' | 'Total' | 'Count';

export interface AzureMetricAvailability {
  timeGrain?: string;
  retention?: string;
}

export interface AzureMetricDefinition {
  name: {
    value: string;
    localizedValue?: string;
  };
  primaryAggregationType?: string;
  supportedAggregationTypes?: string[];
  unit?: string;
  metricAvailabilities?: AzureMetricAvailability[];
}

export interface AzureMetricDataPoint {
  timeStamp: string;
  average?: number;
  maximum?: number;
  total?: number;
  count?: number;
  minimum?: number;
}

interface AzureMetricDefinitionsResponse {
  value?: AzureMetricDefinition[];
}

interface AzureMetricsResponse {
  value?: Array<{
    name?: {
      value?: string;
      localizedValue?: string;
    };
    unit?: string;
    timeseries?: Array<{
      data?: AzureMetricDataPoint[];
    }>;
  }>;
}

@Injectable({ providedIn: 'root' })
export class AzureMetricsService {
  private readonly definitionsCache = new Map<string, Observable<AzureMetricDefinition[]>>();

  constructor(private readonly armApi: ArmApiService) {}

  public getMetricDefinitions(resourceId: string): Observable<AzureMetricDefinition[]> {
    const cacheKey = resourceId.toLocaleLowerCase();
    const cached = this.definitionsCache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const request = this.armApi.get<AzureMetricDefinitionsResponse>(
      `${resourceId}/providers/Microsoft.Insights/metricDefinitions`,
      { params: { 'api-version': '2018-01-01' } }
    ).pipe(
      map((response) => response.value ?? []),
      shareReplay({ bufferSize: 1, refCount: false })
    );

    this.definitionsCache.set(cacheKey, request);
    return request;
  }

  public getMetric(
    resourceId: string,
    metricName: string,
    aggregation: MetricAggregation,
    start: Date,
    end: Date,
    interval: string
  ): Observable<{
    name: string;
    unit?: string;
    data: AzureMetricDataPoint[];
  }> {
    const path = `${resourceId}/providers/Microsoft.Insights/metrics`;
    const params = {
      'api-version': '2018-01-01',
      metricnames: metricName,
      aggregation,
      timespan: `${start.toISOString()}/${end.toISOString()}`,
      interval
    };

    return this.armApi.get<AzureMetricsResponse>(path, { params }).pipe(
      map((response) => {
        const metric = response.value?.[0];

        return {
          name: metric?.name?.localizedValue ?? metric?.name?.value ?? metricName,
          unit: metric?.unit,
          data: metric?.timeseries?.[0]?.data ?? []
        };
      })
    );
  }
}
