import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import {
  AzureMetricDefinition,
  AzureMetricsService
} from '@services/azure/azure-metrics.service';
import {
  ResourceSelectionService,
  SelectedAzureResource
} from '@services/azome/resource-selection.service';
import { MetricExplorerComponent } from './metric-explorer.component';

describe('MetricExplorerComponent', () => {
  let fixture: ComponentFixture<MetricExplorerComponent>;
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
      imports: [MetricExplorerComponent],
      providers: [
        { provide: AzureMetricsService, useValue: metrics }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MetricExplorerComponent);
    resourceSelection = TestBed.inject(ResourceSelectionService);
  });

  it('selects a linked resource without selecting or querying metrics', () => {
    fixture.componentRef.setInput('resources', [firstResource, secondResource]);
    fixture.componentRef.setInput('initialResource', secondResource);
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedExplorerResourceIds).toEqual([secondResource.id]);
    expect(fixture.componentInstance.selectedExplorerMetricNames).toEqual([]);
    expect(metrics.getMetric).not.toHaveBeenCalled();
  });

  it('changes only the query resource selection, not the shared resource selection', () => {
    resourceSelection.select(firstResource);
    resourceSelection.select(secondResource);
    fixture.componentRef.setInput('resources', [firstResource, secondResource]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const resourceCheckboxes = element.querySelectorAll<HTMLInputElement>('.resource-option input');
    resourceCheckboxes[0].checked = false;
    resourceCheckboxes[0].dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedExplorerResourceIds).toEqual([secondResource.id]);
    expect(resourceSelection.selectedResources).toEqual([firstResource, secondResource]);

    const firstResourceCheckbox = element.querySelector<HTMLInputElement>('.resource-option input')!;
    firstResourceCheckbox.checked = true;
    firstResourceCheckbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedExplorerResourceIds).toEqual([
      firstResource.id,
      secondResource.id
    ]);
    expect(resourceSelection.selectedResources).toEqual([firstResource, secondResource]);
  });

  it('selects and clears all supported resources', () => {
    fixture.componentRef.setInput('resources', [firstResource, secondResource]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const selectAll = element.querySelector<HTMLInputElement>('.resource-select-all input')!;
    const resourceCheckboxes = element.querySelectorAll<HTMLInputElement>('.resource-option input');
    expect(selectAll.checked).toBeTrue();

    resourceCheckboxes[0].checked = false;
    resourceCheckboxes[0].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(selectAll.indeterminate).toBeTrue();

    selectAll.checked = false;
    selectAll.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedExplorerResourceIds).toEqual([]);
    expect(selectAll.checked).toBeFalse();
    expect(selectAll.indeterminate).toBeFalse();

    selectAll.checked = true;
    selectAll.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedExplorerResourceIds).toEqual([
      firstResource.id,
      secondResource.id
    ]);
  });

  it('renders unsupported resources without a checkbox and hides the Azure error details', () => {
    const unsupportedResource: SelectedAzureResource = {
      id: '/subscriptions/sub/resourceGroups/network/providers/Microsoft.Network/routeTables/rt-data',
      name: 'rt-data',
      type: 'Microsoft.Network/routeTables',
      resourceGroup: 'network'
    };
    const azureMessage = 'Microsoft.Network/routeTables is not a supported resource type.';
    spyOn(console, 'error');
    metrics.getMetricDefinitions.and.callFake((resourceId) =>
      resourceId === unsupportedResource.id
        ? throwError(() => new HttpErrorResponse({
          status: 400,
          statusText: 'Bad Request',
          error: { code: 'BadRequest', message: azureMessage }
        }))
        : of(definitions)
    );
    fixture.componentRef.setInput('resources', [unsupportedResource]);
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedExplorerResourceIds).toEqual([]);
    expect(fixture.componentInstance.unsupportedResourceError(unsupportedResource.id))
      .toBe(azureMessage);

    const element = fixture.nativeElement as HTMLElement;
    const notice = element.querySelector('.error-message');
    expect(element.querySelector('.resource-option input')).toBeNull();
    expect(element.querySelector('.unsupported-metric-icon')).not.toBeNull();
    expect(notice?.textContent).not.toContain(azureMessage);
  });

  it('queries selected metrics for selected resources using the chosen range', () => {
    fixture.componentRef.setInput('resources', [firstResource, secondResource]);
    fixture.componentRef.setInput('timeRange', '7d');
    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
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
  });
});
