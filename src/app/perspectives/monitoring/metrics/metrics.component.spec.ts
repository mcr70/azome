import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { AzureMetricsService } from '@services/azure/azure-metrics.service';
import { ResourceGraphDialogService } from '@services/azome/resource-graph-dialog.service';
import { SelectedAzureResource } from '@services/azome/resource-selection.service';
import { MetricExplorerComponent } from './metric-explorer.component';
import { MetricsComponent } from './metrics.component';

describe('MetricsComponent', () => {
  let fixture: ComponentFixture<MetricsComponent>;
  let metrics: jasmine.SpyObj<AzureMetricsService>;

  const linkedResource: SelectedAzureResource = {
    id: '/subscriptions/sub/resourceGroups/apps/providers/Microsoft.Web/sites/orders',
    name: 'orders',
    type: 'Microsoft.Web/sites',
    resourceGroup: 'apps'
  };

  beforeEach(async () => {
    metrics = jasmine.createSpyObj<AzureMetricsService>(
      'AzureMetricsService',
      ['getMetricDefinitions', 'getMetric']
    );
    metrics.getMetricDefinitions.and.returnValue(of([]));
    metrics.getMetric.and.returnValue(of({ name: 'Requests', data: [] }));

    await TestBed.configureTestingModule({
      imports: [MetricsComponent],
      providers: [
        { provide: AzureMetricsService, useValue: metrics }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MetricsComponent);
  });

  it('switches to Explorer and passes the linked resource to its child', () => {
    fixture.componentRef.setInput('initialResource', linkedResource);
    fixture.detectChanges();

    const explorer = fixture.debugElement.query(By.directive(MetricExplorerComponent))
      .componentInstance as MetricExplorerComponent;

    expect(fixture.componentInstance.metricView).toBe('explorer');
    expect(explorer.selectedExplorerResourceIds).toEqual([linkedResource.id]);
    expect(explorer.selectedExplorerMetricNames).toEqual([]);
    expect(metrics.getMetric).not.toHaveBeenCalled();
  });

  it('shows the empty resource state only on the Auto-Metrics view', () => {
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.metrics-empty-selection')).not.toBeNull();

    element.querySelector<HTMLButtonElement>('#metric-explorer-tab')?.click();
    fixture.detectChanges();

    expect(element.querySelector('.metrics-empty-selection')).toBeNull();
    expect(fixture.componentInstance.metricView).toBe('explorer');
  });

  it('opens Resource Graph from the shared toolbar', () => {
    const requestOpen = spyOn(TestBed.inject(ResourceGraphDialogService), 'requestOpen');
    fixture.detectChanges();

    const findResources = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.metrics-controls button');
    findResources?.click();

    expect(requestOpen).toHaveBeenCalledOnceWith();
  });
});
