import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, Subject } from 'rxjs';
import {
  AzureMetricDefinition,
  AzureMetricsService
} from '@services/azure/azure-metrics.service';
import { SelectedAzureResource } from '@services/azome/resource-selection.service';
import { AutoMetricsComponent } from './auto-metrics.component';
import { MetricChartComponent } from '@components/metric-chart/metric-chart.component';

describe('AutoMetricsComponent', () => {
  let fixture: ComponentFixture<AutoMetricsComponent>;
  let metrics: jasmine.SpyObj<AzureMetricsService>;

  const definitions: AzureMetricDefinition[] = [
    {
      name: { value: 'Requests' },
      primaryAggregationType: 'Total',
      supportedAggregationTypes: ['Total', 'Count'],
      unit: 'Count'
    },
    {
      name: { value: 'Percentage CPU' },
      primaryAggregationType: 'Average',
      supportedAggregationTypes: ['Average', 'Maximum'],
      unit: 'Percent'
    },
    {
      name: { value: 'Network In Total' },
      primaryAggregationType: 'Total',
      supportedAggregationTypes: ['Total'],
      unit: 'Bytes'
    },
    {
      name: { value: 'Network Out Total' },
      primaryAggregationType: 'Total',
      supportedAggregationTypes: ['Total'],
      unit: 'Bytes'
    },
    {
      name: { value: 'Disk Read Bytes' },
      primaryAggregationType: 'Total',
      supportedAggregationTypes: ['Total'],
      unit: 'Bytes'
    },
    {
      name: { value: 'Disk Write Bytes' },
      primaryAggregationType: 'Total',
      supportedAggregationTypes: ['Total'],
      unit: 'Bytes'
    }
  ];

  const firstResource: SelectedAzureResource = {
    id: '/subscriptions/sub/resourceGroups/apps/providers/Microsoft.Compute/virtualMachines/vm-one',
    name: 'vm-one',
    type: 'Microsoft.Compute/virtualMachines',
    resourceGroup: 'apps'
  };
  const secondResource: SelectedAzureResource = {
    ...firstResource,
    id: '/subscriptions/sub/resourceGroups/apps/providers/Microsoft.Compute/virtualMachines/vm-two',
    name: 'vm-two'
  };

  beforeEach(async () => {
    metrics = jasmine.createSpyObj<AzureMetricsService>(
      'AzureMetricsService',
      ['getMetricDefinitions', 'getMetric']
    );
    metrics.getMetricDefinitions.and.returnValue(of(definitions));
    metrics.getMetric.and.callFake((_resourceId, metricName, _aggregation, _start, _end, _interval) =>
      of({
        name: metricName,
        unit: 'Count',
        data: [{ timeStamp: '2026-10-29T08:00:00Z', total: 8, average: 8 }]
      })
    );

    await TestBed.configureTestingModule({
      imports: [AutoMetricsComponent],
      providers: [
        { provide: AzureMetricsService, useValue: metrics }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AutoMetricsComponent);
  });

  it('uses the resource metric profile before falling back to other definitions', () => {
    fixture.componentRef.setInput('resources', [firstResource]);
    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();

    expect(metrics.getMetric.calls.allArgs().map((args) => args[1])).toEqual([
      'Percentage CPU',
      'Network In Total',
      'Network Out Total',
      'Disk Read Bytes',
      'Disk Write Bytes'
    ]);
    expect(fixture.nativeElement.textContent).toContain('Percentage CPU');
  });

  it('uses the first four metric definitions when no resource profile exists', () => {
    const resource = { ...firstResource, type: 'Microsoft.Example/widgets' };
    fixture.componentRef.setInput('resources', [resource]);
    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();

    expect(metrics.getMetric.calls.allArgs().map((args) => args[1])).toEqual([
      'Requests',
      'Percentage CPU',
      'Network In Total',
      'Network Out Total'
    ]);
  });

  it('uses a time grain supported by the selected metric', () => {
    const resource = { ...firstResource, type: 'Microsoft.Example/widgets' };
    metrics.getMetricDefinitions.and.returnValue(of([{
      ...definitions[0],
      metricAvailabilities: [{ timeGrain: 'PT1H' }]
    }]));
    fixture.componentRef.setInput('resources', [resource]);
    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();

    expect(metrics.getMetric.calls.first().args[5]).toBe('PT1H');
  });

  it('renders each resource as it finishes loading its definitions', () => {
    const pendingDefinitions = new Subject<AzureMetricDefinition[]>();
    metrics.getMetricDefinitions.and.callFake((resourceId) =>
      resourceId === secondResource.id ? pendingDefinitions : of(definitions)
    );
    fixture.componentRef.setInput('resources', [firstResource, secondResource]);
    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.metrics-loading .loading-spinner')).not.toBeNull();
    expect(element.querySelector('.metrics-loading')?.textContent).toContain('1 /');
    expect(element.querySelectorAll('.resource-metrics-card').length).toBe(1);

    pendingDefinitions.next(definitions);
    pendingDefinitions.complete();
    fixture.detectChanges();

    expect(element.querySelector('.metrics-loading')).toBeNull();
    expect(element.querySelectorAll('.resource-metrics-card').length).toBe(2);
  });

  it('keeps the chart zoom when change detection runs', (done) => {
    fixture.componentRef.setInput('resources', [firstResource]);
    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();

    const chartDebugElement = fixture.debugElement
      .queryAll(By.directive(MetricChartComponent))
      .find((item) => item.componentInstance.metrics.length > 1);
    expect(chartDebugElement).toBeDefined();

    if (!chartDebugElement) {
      done();
      return;
    }

    const chartComponent = chartDebugElement.componentInstance as MetricChartComponent;
    chartComponent.openExpandedChart();

    requestAnimationFrame(() => {
      const chart = chartComponent.expandedChartInstance;
      expect(chart).toBeDefined();
      if (!chart) {
        done();
        return;
      }

      chart.dispatchAction({ type: 'dataZoom', start: 20, end: 80 });
      fixture.detectChanges();

      const zoom = (chart.getOption()['dataZoom'] as Array<{ start?: number; end?: number }>)[0];
      expect(zoom.start).toBe(20);
      expect(zoom.end).toBe(80);
      done();
    });
  });
});
