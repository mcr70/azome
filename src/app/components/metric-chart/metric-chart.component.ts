import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgxChartsModule, LegendPosition } from '@swimlane/ngx-charts';
import { AzureMetricsService, MetricAggregation, AzureMetricDataPoint } from '@services/azure/azure-metrics.service';

@Component({
  selector: 'app-metric-chart',
  standalone: true,
  imports: [CommonModule, NgxChartsModule],
  templateUrl: './metric-chart.component.html',
  styleUrl: './metric-chart.component.scss'
})
export class MetricChartComponent implements OnChanges {
  @Input({ required: true }) resourceId!: string;
  @Input({ required: true }) metricName!: string;
  @Input() aggregation: MetricAggregation = 'Total';
  @Input() durationMinutes: number = 60;
  @Input() start?: Date;
  @Input() end?: Date;
  @Input() interval: string = 'PT1M';

  chartData: any[] = [];
  legendPosition: LegendPosition = LegendPosition.Right;

  constructor(private readonly azureMetricsService: AzureMetricsService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (this.resourceId && this.metricName) {
      this.loadMetric();
    }
  }

loadMetric() {
    const end = this.end ?? new Date();
    const start = this.start ?? new Date(end.getTime() - this.durationMinutes * 60000);

    const validAggregation: MetricAggregation = ['Average', 'Maximum', 'Total', 'Count'].includes(this.aggregation)
      ? this.aggregation
      : 'Total';

    this.azureMetricsService.getMetric(
      this.resourceId,
      this.metricName,
      validAggregation,
      start,
      end,
      this.interval
    ).subscribe({
      next: (result) => {
        this.chartData = [{
          name: result.name,
          series: (result.data || []).map((dp: AzureMetricDataPoint) => ({
            name: new Date(dp.timeStamp),
            value: this.getMetricValue(dp, validAggregation)
          }))
        }];
      },
      error: (err) => {
        console.error('Metric load error:', err);
        this.chartData = []; 
      }
    });
  }


  private getMetricValue(dp: AzureMetricDataPoint, aggregation: MetricAggregation): number {
    const aggLower = aggregation.toLowerCase();
    if (aggLower === 'average' && dp.average !== undefined) return dp.average;
    if (aggLower === 'maximum' && dp.maximum !== undefined) return dp.maximum;
    if (aggLower === 'minimum' && dp.minimum !== undefined) return dp.minimum;
    if (aggLower === 'count' && dp.count !== undefined) return dp.count;
    if (aggLower === 'total' && dp.total !== undefined) return dp.total;
    
    return dp.total ?? dp.average ?? dp.maximum ?? dp.minimum ?? dp.count ?? 0;
  }
}