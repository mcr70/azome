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
  LegendComponent,
  LegendComponentOption,
  TooltipComponent,
  TooltipComponentOption,
  DataZoomComponent,
  DataZoomComponentOption
} from 'echarts/components';
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers';
import { LegacyGridContainLabel } from 'echarts/features';
import { MetricChart as MetricChartModel } from '../../perspectives/monitoring/metrics/metrics.model';

echarts.use([
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  DataZoomComponent,
  CanvasRenderer,
  SVGRenderer,
  LegacyGridContainLabel
]);

type EChartsOption = echarts.ComposeOption<
  LineSeriesOption | GridComponentOption | LegendComponentOption | TooltipComponentOption | DataZoomComponentOption
>;

const SERIES_COLORS = [
  '#0284c7',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0d9488',
  '#db2777',
  '#4f46e5'
];

/**
 * Shared chart component for displaying one or more Azure metric series.
 * It receives pre-fetched MetricChart models and renders an ECharts line chart.
 */
@Component({
  selector: 'app-metric-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './metric-chart.component.html',
  styleUrl: './metric-chart.component.scss'
})
export class MetricChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  /** Metric series pre-fetched by the parent view. */
  @Input({ required: true }) metrics: MetricChartModel[] = [];

  /** Reference to the chart DOM container. */
  @ViewChild('chartContainer') chartContainer?: ElementRef<HTMLDivElement>;

  @ViewChild('expandedChartContainer') expandedChartContainer?: ElementRef<HTMLDivElement>;

  @ViewChild('expandedDialog') expandedDialog?: ElementRef<HTMLDialogElement>;

  /** ECharts instance used to render the metric points. */
  chartInstance?: echarts.ECharts;

  /** ECharts instance displayed in the expanded dialog. */
  expandedChartInstance?: echarts.ECharts;

  /** ResizeObserver to automatically resize chart when container size changes. */
  private resizeObserver?: ResizeObserver;

  constructor() {}

  /** Accessible label summarizing the plotted metric series. */
  public get chartLabel(): string {
    const list = this.metrics ?? [];
    if (list.length === 0) {
      return 'Metric chart';
    }
    return list.map((m) => m.name).join(', ');
  }

  ngAfterViewInit(): void {
    this.setupResizeObserver();
    this.initChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['metrics']) {
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

    this.expandedChartInstance?.dispose();
    this.expandedChartInstance = undefined;
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
   * Updates the ECharts configuration with all provided metric series. Returns no value.
   */
  private updateChart(): void {
    const seriesList = this.metrics ?? [];
    if (seriesList.length === 0) {
      return;
    }

    if (this.chartInstance) {
      this.chartInstance.setOption(this.buildChartOption(seriesList, false) as any, true);
    }

    if (this.expandedChartInstance) {
      this.expandedChartInstance.setOption(this.buildChartOption(seriesList, true) as any, true);
      this.expandedChartInstance.resize();
    }
  }

  /** Opens the expanded chart dialog and initializes its ECharts instance. */
  openExpandedChart(): void {
    const dialog = this.expandedDialog?.nativeElement;
    if (!dialog || dialog.open) {
      return;
    }

    dialog.showModal();
    requestAnimationFrame(() => {
      const element = this.expandedChartContainer?.nativeElement;
      if (!element) {
        return;
      }

      this.expandedChartInstance = echarts.init(element, null, { renderer: 'svg' });
      this.updateChart();
      this.expandedChartInstance.resize();
    });
  }

  /** Closes the expanded chart dialog and releases its ECharts instance. */
  closeExpandedChart(): void {
    this.expandedDialog?.nativeElement.close();
    this.releaseExpandedChart();
  }

  /** Releases the expanded chart after the native dialog closes. */
  onExpandedDialogClosed(): void {
    this.releaseExpandedChart();
  }

  /** Disposes and clears the expanded ECharts instance. */
  private releaseExpandedChart(): void {
    this.expandedChartInstance?.dispose();
    this.expandedChartInstance = undefined;
  }

  /**
   * Builds a clear series name, adding resource context when multiple series are shown.
   */
  private buildSeriesName(metric: MetricChartModel, hasMultipleSeries: boolean): string {
    const resourceName = (metric as any)?.resource?.name;
    if (hasMultipleSeries && resourceName) {
      return `${resourceName} · ${metric.name}`;
    }
    return metric.name;
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
   * Builds ECharts option for either the compact card chart or the expanded dialog chart.
   */
  private buildChartOption(seriesList: MetricChartModel[], isExpanded: boolean): EChartsOption {
    const hasMultipleSeries = seriesList.length > 1;
    const unitBySeriesIndex = new Map<number, string>();

    const echartsSeries: LineSeriesOption[] = seriesList.map((metric, index) => {
      const color = SERIES_COLORS[index % SERIES_COLORS.length];
      unitBySeriesIndex.set(index, metric.unit ? ` ${metric.unit}` : '');

      const points = (metric.points || [])
        .map((dp) => [
          new Date(dp.timeStamp).getTime(),
          this.selectValue(dp, metric.aggregation)
        ])
        .sort((first, second) => first[0] - second[0]);

      const seriesName = this.buildSeriesName(metric, hasMultipleSeries);

      const lineOption: LineSeriesOption = {
        name: seriesName,
        type: 'line',
        data: points,
        smooth: true,
        showSymbol: true,
        symbolSize: 4,
        itemStyle: {
          color
        },
        lineStyle: {
          width: 2,
          color
        }
      };

      if (!hasMultipleSeries) {
        lineOption.areaStyle = {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(2, 132, 199, 0.25)' },
            { offset: 1, color: 'rgba(2, 132, 199, 0.02)' }
          ])
        };
      }

      return lineOption;
    });

    const bottomMargin = isExpanded
      ? hasMultipleSeries ? 92 : 72
      : hasMultipleSeries ? 44 : 24;

    return {
      animation: false,
      legend: {
        show: hasMultipleSeries,
        bottom: isExpanded ? 42 : 0,
        textStyle: {
          color: '#475569',
          fontSize: 11
        }
      },
      grid: {
        top: 16,
        right: 16,
        bottom: bottomMargin,
        left: 12,
        containLabel: true
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) {
            return '';
          }

          const timestamp = params[0]?.value?.[0];
          const timeLabel = timestamp !== undefined ? new Date(timestamp).toLocaleString() : '';

          const rows = params.map((item: any) => {
            const val = item?.value?.[1];
            const seriesIdx = typeof item?.seriesIndex === 'number' ? item.seriesIndex : 0;
            const unit = unitBySeriesIndex.get(seriesIdx) ?? '';
            const formattedVal =
              typeof val === 'number'
                ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(val)
                : val;

            return `${item.marker}<span>${item.seriesName}:</span> <strong>${formattedVal}${unit}</strong>`;
          });

          return timeLabel ? `${timeLabel}<br/>${rows.join('<br/>')}` : rows.join('<br/>');
        }
      },
      ...(isExpanded
        ? {
            dataZoom: [
              {
                type: 'slider',
                xAxisIndex: 0,
                height: 22,
                bottom: 8,
                throttle: 50,
                handleSize: '120%',
                moveHandleSize: 6,
                showDetail: false,
                brushSelect: true,
                fillerColor: 'rgba(59, 130, 246, 0.18)',
                brushStyle: {
                  color: '#3b82f6',
                  opacity: 0.25
                }
              },
              {
                type: 'inside',
                xAxisIndex: 0,
                throttle: 50,
                zoomOnMouseWheel: true,
                moveOnMouseWheel: false,
                moveOnMouseMove: false
              }
            ]
          }
        : {}),
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
      series: echartsSeries
    };
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
