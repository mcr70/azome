import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { MetricChartComponent } from './metric-chart.component';
import { MetricChart } from '../../perspectives/monitoring/metrics/metrics.model';

describe('MetricChartComponent', () => {
  let component: MetricChartComponent;
  let fixture: ComponentFixture<MetricChartComponent>;

  const mockMetric: MetricChart = {
    resource: {
      id: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/vm1',
      name: 'vm1',
      type: 'Microsoft.Compute/virtualMachines',
      resourceGroup: 'rg'
    },
    name: 'Percentage CPU',
    unit: 'Percent',
    aggregation: 'Average',
    points: [
      {
        timeStamp: '2026-11-19T10:00:00Z',
        average: 15.5
      },
      {
        timeStamp: '2026-11-19T10:05:00Z',
        average: 28.2
      }
    ]
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MetricChartComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(MetricChartComponent);
    component = fixture.componentInstance;
    component.metrics = [mockMetric];
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create the component', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should initialize echarts instance on view init', () => {
    fixture.detectChanges();
    expect(component.chartInstance).toBeDefined();
  });

  it('should update chart options when metric changes', () => {
    fixture.detectChanges();
    const chart = component.chartInstance;
    expect(chart).toBeDefined();

    if (chart) {
      spyOn(chart, 'setOption').and.callThrough();

      const updatedMetric: MetricChart = {
        ...mockMetric,
        aggregation: 'Maximum',
        points: [
          {
            timeStamp: '2026-11-19T10:00:00Z',
            maximum: 45.0
          }
        ]
      };

      component.metrics = [updatedMetric];
      component.ngOnChanges({
        metrics: new SimpleChange([mockMetric], [updatedMetric], false)
      });

      expect(chart.setOption).toHaveBeenCalled();
    }
  });

  it('should dispose chart and observer on destroy', () => {
    fixture.detectChanges();
    const chart = component.chartInstance;
    expect(chart).toBeDefined();

    if (chart) {
      spyOn(chart, 'dispose').and.callThrough();
      component.ngOnDestroy();
      expect(chart.dispose).toHaveBeenCalled();
      expect(component.chartInstance).toBeUndefined();
    }
  });

  it('should render svg element inside the chart container', () => {
    fixture.detectChanges();
    const container = fixture.nativeElement.querySelector('.chart-container');
    expect(container).toBeTruthy();
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('zooms a multi-series chart when the slider handle is dragged', (done) => {
    const secondMetric: MetricChart = {
      ...mockMetric,
      name: 'Network Out Total',
      points: Array.from({ length: 12 }, (_, index) => ({
        timeStamp: new Date(Date.parse('2026-11-19T10:00:00Z') + index * 60_000).toISOString(),
        average: index * 2
      }))
    };

    component.metrics = [mockMetric, secondMetric];
    fixture.detectChanges();
    component.openExpandedChart();

    requestAnimationFrame(() => {
      const chart = component.expandedChartInstance;
      const svg = fixture.nativeElement.querySelector(
        '.expanded-chart-container svg'
      ) as SVGSVGElement | null;
      expect(chart).toBeDefined();
      expect(svg).not.toBeNull();

      if (!chart || !svg) {
        done();
        return;
      }

      let zoomChanged = false;
      chart.on('datazoom', () => {
        zoomChanged = true;
      });

      const handler = chart.getZr().handler as any;

      let handlePoint: { x: number; y: number } | undefined;
      for (let x = 630; x <= 645 && !handlePoint; x += 1) {
        for (let y = 260; y <= 296; y += 1) {
          handler.dispatch('mousemove', { zrX: x, zrY: y, event: {} });
          if (handler._hovered?.target?.cursor === 'ew-resize') {
            handlePoint = { x, y };
            break;
          }
        }
      }

      expect(handlePoint).toBeDefined();
      if (!handlePoint) {
        done();
        return;
      }

      const dragEvent = (x: number, y: number) => ({
        zrX: x,
        zrY: y,
        preventDefault: () => undefined,
        stopPropagation: () => undefined
      });

      handler.dispatch('mousedown', dragEvent(handlePoint.x, handlePoint.y));
      handler.dispatch('mousemove', dragEvent(handlePoint.x - 80, handlePoint.y));
      handler.dispatch('mouseup', dragEvent(handlePoint.x - 80, handlePoint.y));

      const zoomOptions = chart.getOption()['dataZoom'] as Array<{
        start?: number;
        end?: number;
      }>;
      const zoom = zoomOptions[0];
      expect(zoomChanged).toBeTrue();
      expect(zoom.end).toBeLessThan(100);
      done();
    });
  });

  it('should handle null or zero metric data points without error', () => {
    const zeroMetric: MetricChart = {
      ...mockMetric,
      points: [
        { timeStamp: '2026-11-19T10:00:00Z', average: 0 },
        { timeStamp: '2026-11-19T10:05:00Z', average: undefined as any }
      ]
    };
    component.metrics = [zeroMetric];
    fixture.detectChanges();
    const container = fixture.nativeElement.querySelector('.chart-container');
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
