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
    component.metric = mockMetric;
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

      component.metric = updatedMetric;
      component.ngOnChanges({
        metric: new SimpleChange(mockMetric, updatedMetric, false)
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

  it('should handle null or zero metric data points without error', () => {
    const zeroMetric: MetricChart = {
      ...mockMetric,
      points: [
        { timeStamp: '2026-11-19T10:00:00Z', average: 0 },
        { timeStamp: '2026-11-19T10:05:00Z', average: undefined as any }
      ]
    };
    component.metric = zeroMetric;
    fixture.detectChanges();
    const container = fixture.nativeElement.querySelector('.chart-container');
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
