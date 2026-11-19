import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as echarts from 'echarts/core';
import { LineChart, LineSeriesOption } from 'echarts/charts';
import {
  GridComponent,
  GridComponentOption,
  TooltipComponent,
  TooltipComponentOption
} from 'echarts/components';
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers';
import { LegacyGridContainLabel } from 'echarts/features';
import { MetricChart as MetricChartModel } from '../../perspectives/monitoring/metrics/metrics.model';

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  CanvasRenderer,
  SVGRenderer,
  LegacyGridContainLabel
]);

type EChartsOption = echarts.ComposeOption<
  LineSeriesOption | GridComponentOption | TooltipComponentOption
>;

/**
 * Shared chart component for displaying Azure metric points.
 * It receives a MetricChart model containing pre-fetched points and renders an ECharts line chart.
 */
@Component({
  selector: 'app-metric-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './metric-chart.component.html',
  styleUrl: './metric-chart.component.scss'
})
export class MetricChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  /** Metric data pre-fetched by the parent view. */
  @Input({ required: true }) metric!: MetricChartModel;

  /** Reference to the chart DOM container. */
  @ViewChild('chartContainer') chartContainer?: ElementRef<HTMLDivElement>;

  /** ECharts instance used to render the metric points. */
  chartInstance?: echarts.ECharts;

  /** ResizeObserver to automatically resize chart when container size changes. */
  private resizeObserver?: ResizeObserver;

  constructor() {}

  ngAfterViewInit(): void {
    this.setupResizeObserver();
    this.initChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['metric']) {
      if (this.chartInstance) {
        this.updateChart();
      } else if (this.chartContainer?.nativeElement) {
        this.initChart();
      }
    }
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = undefined;
    }

    if (this.chartInstance) {
      this.chartInstance.dispose();
      this.chartInstance = undefined;
    }
  }

  /**
   * Initializes the ECharts instance and sets up responsiveness. Returns no value.
   */
  private initChart(): void {
    const element = this.chartContainer?.nativeElement;
    if (!element) {
      return;
    }

    if (!this.chartInstance) {
      this.chartInstance = echarts.init(element, null, {
        renderer: 'svg'
      });
    }

    this.updateChart();
    this.chartInstance.resize();
  }

  /**
   * Updates the ECharts configuration with the latest metric points. Returns no value.
   */
  private updateChart(): void {
    if (!this.chartInstance || !this.metric) {
      return;
    }

    const rawPoints = this.metric.points || [];
    const seriesData = rawPoints
      .map((dp) => [
        new Date(dp.timeStamp).getTime(),
        this.selectValue(dp, this.metric.aggregation)
      ])
      .sort((first, second) => first[0] - second[0]);

    const unit = this.metric.unit ? ` ${this.metric.unit}` : '';
    const metricName = this.metric.name;

    const option: EChartsOption = {
      animation: false,
      grid: {
        top: 16,
        right: 16,
        bottom: 24,
        left: 12,
        containLabel: true
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) {
            return '';
          }
          const item = params[0];
          const time = new Date(item.value[0]).toLocaleString();
          const val = item.value[1];
          const formattedVal =
            typeof val === 'number'
              ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(val)
              : val;
          return `${time}<br/><strong>${item.marker}${formattedVal}${unit}</strong>`;
        }
      },
      xAxis: {
        type: 'time',
        boundaryGap: [0, 0],
        axisLine: {
          lineStyle: { color: '#cbd5e1' }
        },
        axisLabel: {
          color: '#64748b',
          fontSize: 11,
          hideOverlap: true
        },
        splitLine: {
          show: false
        }
      },
      yAxis: {
        type: 'value',
        min: 0,
        minInterval: 1,
        axisLine: {
          show: false
        },
        axisLabel: {
          color: '#64748b',
          fontSize: 11,
          formatter: (val: number) => {
            return new Intl.NumberFormat(undefined, {
              notation: 'compact',
              maximumFractionDigits: 1
            }).format(val);
          }
        },
        splitLine: {
          lineStyle: {
            color: '#f1f5f9'
          }
        }
      },
      series: [
        {
          name: metricName,
          type: 'line',
          data: seriesData,
          smooth: true,
          showSymbol: true,
          symbolSize: 4,
          itemStyle: {
            color: '#0284c7'
          },
          lineStyle: {
            width: 2,
            color: '#0284c7'
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(2, 132, 199, 0.25)' },
              { offset: 1, color: 'rgba(2, 132, 199, 0.02)' }
            ])
          }
        }
      ]
    };

    this.chartInstance.setOption(option as any, true);
  }

  /**
   * Sets up a ResizeObserver to automatically resize the chart on container width/height change.
   */
  private setupResizeObserver(): void {
    const element = this.chartContainer?.nativeElement;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          if (!this.chartInstance) {
            this.initChart();
          } else {
            this.chartInstance.resize();
          }
        }
      }
    });

    this.resizeObserver.observe(element);
  }

  /**
   * Selects the metric value based on the specified aggregation type.
   *
   * @param dp Data point from Azure monitor metrics.
   * @param aggregation Selected aggregation type name.
   * @returns Numeric metric value for the point.
   */
  private selectValue(dp: any, aggregation: string): number {
    const agg = aggregation?.toLowerCase();
    if (agg === 'average') {
      return dp.average ?? 0;
    }
    if (agg === 'maximum') {
      return dp.maximum ?? 0;
    }
    if (agg === 'minimum') {
      return dp.minimum ?? 0;
    }
    if (agg === 'count') {
      return dp.count ?? 0;
    }
    if (agg === 'total') {
      return dp.total ?? 0;
    }
    return dp.total ?? dp.average ?? dp.maximum ?? dp.minimum ?? dp.count ?? 0;
  }
}
