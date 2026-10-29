import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  AzureMetricDefinition,
  AzureMetricsService
} from '@services/azure/azure-metrics.service';
import {
  ResourceSelectionService,
  SelectedAzureResource
} from '@services/azome/resource-selection.service';
import { ResourceGraphDialogService } from '@services/azome/resource-graph-dialog.service';
import { MetricsComponent } from './metrics.component';

describe('MetricsComponent', () => {
  let fixture: ComponentFixture<MetricsComponent>;
  let metrics: jasmine.SpyObj<AzureMetricsService>;
  let resourceSelection: ResourceSelectionService;

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
      imports: [MetricsComponent],
      providers: [
        { provide: AzureMetricsService, useValue: metrics }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MetricsComponent);
    resourceSelection = TestBed.inject(ResourceSelectionService);
  });

  it('uses the resource metric profile before falling back to other definitions', () => {
    fixture.componentRef.setInput('resources', [firstResource]);
    fixture.detectChanges();

    const queriedNames = metrics.getMetric.calls.allArgs().map((args) => args[1]);
    expect(queriedNames).toEqual([
      'Percentage CPU',
      'Network In Total',
      'Network Out Total',
      'Disk Read Bytes',
      'Disk Write Bytes'
    ]);
    expect(fixture.nativeElement.textContent).toContain('Percentage CPU');
    expect(fixture.nativeElement.querySelectorAll('.metric-card').length).toBe(5);
    expect(fixture.nativeElement.querySelectorAll('.resource-metrics-card').length).toBe(1);
  });

  it('uses the first four Azure definitions when a resource has no metric profile', () => {
    const resource = { ...firstResource, type: 'Microsoft.Example/widgets' };
    fixture.componentRef.setInput('resources', [resource]);
    fixture.detectChanges();

    expect(metrics.getMetric.calls.allArgs().map((args) => args[1])).toEqual([
      'Requests',
      'Percentage CPU',
      'Network In Total',
      'Network Out Total'
    ]);
  });

  it('uses an interval supported by the selected metric', () => {
    const resource = { ...firstResource, type: 'Microsoft.Example/widgets' };
    metrics.getMetricDefinitions.and.returnValue(of([{
      ...definitions[0],
      metricAvailabilities: [{ timeGrain: 'PT1H' }]
    }]));
    fixture.componentRef.setInput('resources', [resource]);
    fixture.detectChanges();

    expect(metrics.getMetric.calls.first().args[5]).toBe('PT1H');
  });

  it('switches linked resources to the explorer and selects only that resource', () => {
    fixture.componentRef.setInput('resources', [firstResource, secondResource]);
    fixture.componentRef.setInput('initialResource', secondResource);
    fixture.detectChanges();

    expect(fixture.componentInstance.metricView).toBe('explorer');
    expect(fixture.componentInstance.selectedExplorerResourceIds).toEqual([secondResource.id]);
    expect(fixture.componentInstance.selectedExplorerMetricNames).toEqual([]);

    metrics.getMetric.calls.reset();
    const element = fixture.nativeElement as HTMLElement;
    const metricSelect = element.querySelector<HTMLSelectElement>('.query-options select[multiple]')!;
    const requestsOption = Array.from(metricSelect.options)
      .find((option) => option.value === 'Requests');
    expect(requestsOption).toBeDefined();
    requestsOption!.selected = true;
    fixture.componentInstance.selectExplorerMetrics(metricSelect);
    fixture.componentInstance.queryExplorer();

    expect(metrics.getMetric).toHaveBeenCalledOnceWith(
      secondResource.id,
      'Requests',
      'Total',
      jasmine.any(Date),
      jasmine.any(Date),
      'PT15M'
    );
  });

  it('does not select or query any metrics automatically in a linked explorer', () => {
    fixture.componentRef.setInput('initialResource', firstResource);
    fixture.detectChanges();

    expect(fixture.componentInstance.metricView).toBe('explorer');
    expect(fixture.componentInstance.selectedExplorerResourceIds).toEqual([firstResource.id]);
    expect(fixture.componentInstance.selectedExplorerMetricNames).toEqual([]);
    expect(metrics.getMetric).not.toHaveBeenCalled();
  });

  it('changes only the Explorer query selection without changing shared resources', () => {
    resourceSelection.select(firstResource);
    resourceSelection.select(secondResource);
    fixture.componentRef.setInput('resources', [firstResource, secondResource]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('#metric-explorer-tab')?.click();
    fixture.detectChanges();

    const resourceCheckboxes = element.querySelectorAll<HTMLInputElement>(
      '.resource-picker input[type="checkbox"]'
    );
    resourceCheckboxes[0].checked = false;
    resourceCheckboxes[0].dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedExplorerResourceIds).toEqual([secondResource.id]);
    expect(resourceSelection.selectedResources).toEqual([firstResource, secondResource]);

    resourceCheckboxes[0].checked = true;
    resourceCheckboxes[0].dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedExplorerResourceIds).toEqual([
      firstResource.id,
      secondResource.id
    ]);
    expect(resourceSelection.selectedResources).toEqual([firstResource, secondResource]);
  });

  it('opens the shared Resource Graph tool from Metric Explorer', () => {
    const requestOpen = spyOn(TestBed.inject(ResourceGraphDialogService), 'requestOpen');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('#metric-explorer-tab')?.click();
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('.resource-graph-open-button')?.click();

    expect(requestOpen).toHaveBeenCalledOnceWith();
  });

  it('offers Resource Graph from the empty resource selection message', () => {
    const requestOpen = spyOn(TestBed.inject(ResourceGraphDialogService), 'requestOpen');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.metrics-empty-selection')?.textContent)
      .toContain('Select resources in the Resources perspective, or');
    element.querySelector<HTMLButtonElement>(
      '.metrics-empty-selection .resource-graph-open-button'
    )?.click();

    expect(requestOpen).toHaveBeenCalledOnceWith();
  });

  it('combines selected resources in the explorer and applies its aggregation and range', () => {
    fixture.componentRef.setInput('resources', [firstResource, secondResource]);
    fixture.detectChanges();
    metrics.getMetric.calls.reset();

    const element: HTMLElement = fixture.nativeElement;
    element.querySelector<HTMLButtonElement>('#metric-explorer-tab')?.click();
    fixture.detectChanges();

    const resourceCheckboxes = element.querySelectorAll<HTMLInputElement>(
      '.resource-picker input[type="checkbox"]'
    );
    expect(resourceCheckboxes.length).toBe(2);
    expect(resourceCheckboxes[0].checked).toBeTrue();
    resourceCheckboxes[1].checked = true;
    resourceCheckboxes[1].dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const range = element.querySelector<HTMLSelectElement>('.time-range-control select')!;
    range.value = '7d';
    range.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const metricSelect = element.querySelector<HTMLSelectElement>('.query-options select[multiple]')!;
    expect(Array.from(metricSelect.selectedOptions)).toHaveSize(0);
    metricSelect.options[0].selected = true;
    metricSelect.options[2].selected = true;
    metricSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    metrics.getMetric.calls.reset();

    element.querySelector<HTMLButtonElement>('.query-button')?.click();
    fixture.detectChanges();

    expect(metrics.getMetric).toHaveBeenCalledTimes(4);
    for (const [resourceId, metricName, aggregation, start, end, interval]
      of metrics.getMetric.calls.allArgs()) {
      expect([firstResource.id, secondResource.id]).toContain(resourceId);
      expect(['Requests', 'Network In Total']).toContain(metricName);
      expect(aggregation).toBe('Total');
      expect(interval).toBe('PT1H');
      expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    }

    expect(element.querySelectorAll('#metric-explorer-panel .metric-card').length).toBe(4);
    expect(element.querySelectorAll('#metric-explorer-panel .resource-metrics-card').length).toBe(2);
  });
});
