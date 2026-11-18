import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgxChartsModule, LegendPosition } from '@swimlane/ngx-charts';
import { MetricChart as MetricChartModel } from '../../perspectives/monitoring/metrics/metrics.model';

/**
 * Shared chart component for displaying Azure metric points.
 * It receives a MetricChart model containing pre‑fetched points and renders a line chart.
 */
@Component({
  selector: 'app-metric-chart',
  standalone: true,
  imports: [CommonModule, NgxChartsModule],
  templateUrl: './metric-chart.component.html',
  styleUrl: './metric-chart.component.scss'
})
export class MetricChartComponent implements OnChanges {
  /** Metric data pre‑fetched by the parent view. */
  @Input({ required: true }) metric!: MetricChartModel;

  /** Chart series formatted for ngx‑charts. */
  chartData: any[] = [];

  legendPosition: LegendPosition = LegendPosition.Right;

  ngOnChanges(changes: SimpleChanges): void {
    if (this.metric) {
      this.prepareChart();
    }
  }

  private prepareChart(): void {
    const series = (this.metric.points || []).map((dp) => ({
      name: new Date(dp.timeStamp),
      value: this.selectValue(dp, this.metric.aggregation)
    }));
    this.chartData = [{ name: this.metric.name, series }];
  }

  private selectValue(dp: any, aggregation: string): number {
    const agg = aggregation?.toLowerCase();
    if (agg === 'average' && dp.average !== undefined) return dp.average;
    if (agg === 'maximum' && dp.maximum !== undefined) return dp.maximum;
    if (agg === 'minimum' && dp.minimum !== undefined) return dp.minimum;
    if (agg === 'count' && dp.count !== undefined) return dp.count;
    if (agg === 'total' && dp.total !== undefined) return dp.total;
    return dp.total ?? dp.average ?? dp.maximum ?? dp.minimum ?? dp.count ?? 0;
  }
}