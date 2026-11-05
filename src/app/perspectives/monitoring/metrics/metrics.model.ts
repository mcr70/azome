import {
  AzureMetricDataPoint,
  AzureMetricDefinition,
  MetricAggregation
} from '@services/azure/azure-metrics.service';
import { SelectedAzureResource } from '@services/azome/resource-selection.service';

export type MetricTimeRange = '1h' | '6h' | '24h' | '7d' | '30d';

export type MetricView = 'auto' | 'explorer';

export interface MetricTimeRangeOption {
  value: MetricTimeRange;
  label: string;
  durationMs: number;
  interval: string;
}

export interface MetricChart {
  resource: SelectedAzureResource;
  name: string;
  unit?: string;
  aggregation: MetricAggregation;
  points: AzureMetricDataPoint[];
  error?: string;
}

export interface ResourceMetricGroup {
  resource: SelectedAzureResource;
  metrics: MetricChart[];
}

export interface ResourceMetricDefinitions {
  resource: SelectedAzureResource;
  definitions: AzureMetricDefinition[];
  error?: string;
  unsupported?: boolean;
}

export interface MetricQuery {
  resource: SelectedAzureResource;
  definition: AzureMetricDefinition;
  aggregation: MetricAggregation;
}

export const TIME_RANGES: MetricTimeRangeOption[] = [
  { value: '1h', label: 'Last hour', durationMs: 60 * 60 * 1000, interval: 'PT1M' },
  { value: '6h', label: 'Last 6 hours', durationMs: 6 * 60 * 60 * 1000, interval: 'PT5M' },
  { value: '24h', label: 'Last 24 hours', durationMs: 24 * 60 * 60 * 1000, interval: 'PT15M' },
  { value: '7d', label: 'Last 7 days', durationMs: 7 * 24 * 60 * 60 * 1000, interval: 'PT1H' },
  { value: '30d', label: 'Last 30 days', durationMs: 30 * 24 * 60 * 60 * 1000, interval: 'PT6H' }
];

export const METRIC_AGGREGATIONS: MetricAggregation[] = ['Average', 'Maximum', 'Total', 'Count'];
