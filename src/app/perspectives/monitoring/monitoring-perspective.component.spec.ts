import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, ParamMap } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { DiagnosticSetting, DiagnosticSettingsResult } from '@services/azure/diagnostic-settings.model';
import { DiagnosticSettingsService } from '@services/azure/diagnostic-settings.service';
import {
  ActivityLogEvent,
  MonitoringResource,
  MonitoringService
} from '@services/azure/monitoring.service';
import { AzureMetricsService } from '@services/azure/azure-metrics.service';
import { LogAnalyticsService } from '@services/azure/log-analytics.service';
import { ResourceGraphService } from '@services/azure/resource-graph.service';
import { ResourceDetailPanelService } from '@services/azome/resource-detail-panel.service';
import { ResourceSelectionService } from '@services/azome/resource-selection.service';
import { MonitoringPerspectiveComponent } from './monitoring-perspective.component';
import { MetricsComponent } from './metrics/metrics.component';

describe('MonitoringPerspectiveComponent diagnostic settings', () => {
  let diagnostics: jasmine.SpyObj<DiagnosticSettingsService>;
  let graph: jasmine.SpyObj<ResourceGraphService>;
  let monitoring: jasmine.SpyObj<MonitoringService>;
  let metrics: jasmine.SpyObj<AzureMetricsService>;
  let logs: jasmine.SpyObj<LogAnalyticsService>;
  let panelService: ResourceDetailPanelService;
  let queryParamMap: BehaviorSubject<ParamMap>;
  const setting: DiagnosticSetting = {
    id: '/app/providers/Microsoft.Insights/diagnosticSettings/export',
    name: 'export',
    type: 'Microsoft.Insights/diagnosticSettings',
    source: {
      id: '/subscriptions/test/resourceGroups/apps/providers/Microsoft.Web/sites/orders',
      name: 'orders',
      type: 'Microsoft.Web/sites'
    },
    properties: { workspaceId: '/workspaces/law' },
    destinations: [{ label: 'Log Analytics workspace', id: '/workspaces/law', name: 'law' }]
  };

  beforeEach(async () => {
    diagnostics = jasmine.createSpyObj<DiagnosticSettingsService>(
      'DiagnosticSettingsService', ['getDiagnosticSettings']
    );
    diagnostics.getDiagnosticSettings.and.returnValue(of({ settings: [setting], failures: [] }));
    graph = jasmine.createSpyObj<ResourceGraphService>('ResourceGraphService', ['getResourceDetails']);
    monitoring = jasmine.createSpyObj<MonitoringService>(
      'MonitoringService', ['getMonitoringResources', 'getActivityLog']
    );
    metrics = jasmine.createSpyObj<AzureMetricsService>(
      'AzureMetricsService', ['getMetricDefinitions', 'getMetric']
    );
    metrics.getMetricDefinitions.and.returnValue(of([]));
    metrics.getMetric.and.returnValue(of({ name: 'Metric', data: [] }));
    logs = jasmine.createSpyObj<LogAnalyticsService>(
      'LogAnalyticsService', ['getTables', 'getActiveTableNames']
    );
    logs.getTables.and.returnValue(of([]));
    logs.getActiveTableNames.and.returnValue(of([]));
    monitoring.getMonitoringResources.and.returnValue(of([]));
    monitoring.getActivityLog.and.returnValue(of([]));
    queryParamMap = new BehaviorSubject(convertToParamMap({}));
    await TestBed.configureTestingModule({
      imports: [MonitoringPerspectiveComponent],
      providers: [
        { provide: MonitoringService, useValue: monitoring },
        { provide: AzureMetricsService, useValue: metrics },
        { provide: LogAnalyticsService, useValue: logs },
        { provide: DiagnosticSettingsService, useValue: diagnostics },
        { provide: ResourceGraphService, useValue: graph },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap }
        }
      ]
    }).compileComponents();
    panelService = TestBed.inject(ResourceDetailPanelService);
  });

  it('shows compact cards and opens connection details without querying Graph', () => {
    const fixture = TestBed.createComponent(MonitoringPerspectiveComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const group = element.querySelector('section[aria-label="Diagnostic settings"]');
    expect(group?.querySelector('.resource-name')?.textContent).toContain('export');
    expect(group?.querySelector('.resource-footer')).toBeNull();
    expect(group?.querySelector('app-resource-card')?.textContent).not.toContain('Source');
    expect(group?.querySelector('app-resource-card')?.textContent).not.toContain('Destinations');
    const openPanel = spyOn(panelService, 'openPanel');
    group?.querySelector<HTMLButtonElement>('.details-action')?.click();
    expect(openPanel).toHaveBeenCalledWith(setting);
    expect(graph.getResourceDetails).not.toHaveBeenCalled();

    fixture.componentInstance.filterQuery = 'orders law';
    expect(fixture.componentInstance.filteredDiagnosticSettings).toEqual([setting]);
    fixture.componentInstance.filterQuery = '!law';
    expect(fixture.componentInstance.filteredDiagnosticSettings).toEqual([]);
  });

  it('keeps resource search out of the Monitoring perspective toolbar', () => {
    const fixture = TestBed.createComponent(MonitoringPerspectiveComponent);
    fixture.detectChanges();
    const toolbar = (fixture.nativeElement as HTMLElement).querySelector('.perspective-actions');

    expect(toolbar?.textContent).not.toContain('Find resources');
    expect(toolbar?.textContent).toContain('Refresh');
  });

  it('shows workspace query actions and opens KQL for the clicked card', () => {
    const workspace = {
      id: '/workspaces/first',
      name: 'first',
      type: 'Microsoft.OperationalInsights/workspaces',
      resourceGroup: 'logs',
      location: 'westeurope',
      category: 'Logs' as const,
      properties: { customerId: 'workspace-one' }
    };
    monitoring.getMonitoringResources.and.returnValue(of([
      workspace,
      { ...workspace, id: '/workspaces/second', name: 'second', properties: { customerId: 'workspace-two' } },
      { ...workspace, id: '/apps/app', name: 'app', type: 'Microsoft.Insights/components' }
    ]));
    const fixture = TestBed.createComponent(MonitoringPerspectiveComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelectorAll('.kql-action').length).toBe(2);
    element.querySelector<HTMLButtonElement>('[aria-label="Query logs for second"]')?.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.kqlWorkspace).toEqual({ id: 'workspace-two', name: 'second' });
    expect(fixture.componentInstance.workspaces[1].properties.customerId).toBe('workspace-two');
    expect(logs.getTables).toHaveBeenCalledOnceWith('workspace-two');
    expect(logs.getActiveTableNames).toHaveBeenCalledOnceWith('workspace-two');
    expect(element.querySelector('dialog')?.open).toBeTrue();
    expect(graph.getResourceDetails).not.toHaveBeenCalled();
    element.querySelector<HTMLButtonElement>('[aria-label="Close KQL dialog"]')?.click();
    fixture.detectChanges();
    expect(element.querySelector('app-kql')).toBeNull();
  });

  it('keeps other data visible during discovery and reports partial failures', () => {
    const response = new Subject<DiagnosticSettingsResult>();
    diagnostics.getDiagnosticSettings.and.returnValue(response);
    const fixture = TestBed.createComponent(MonitoringPerspectiveComponent);
    fixture.detectChanges();
    fixture.componentInstance.resources = [{
      id: '/workspaces/law',
      name: 'law',
      type: 'Microsoft.OperationalInsights/workspaces',
      resourceGroup: 'logs',
      location: 'westeurope',
      category: 'Logs'
    }];
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const resourceGroup = element.querySelector('section[aria-label="Logs resources"]');
    const diagnosticGroup = element.querySelector('section[aria-label="Diagnostic settings"]');
    expect(resourceGroup).not.toBeNull();
    expect(diagnosticGroup).not.toBeNull();
    expect(resourceGroup!.compareDocumentPosition(diagnosticGroup!))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(fixture.componentInstance.loading).toBeFalse();
    expect(fixture.componentInstance.loadingDiagnostics).toBeTrue();
    response.next({
      settings: [setting],
      failures: [{ source: setting.source, message: '403: Forbidden' }]
    });
    fixture.detectChanges();
    expect(element.querySelector('section[aria-label="Logs resources"]')).toBe(resourceGroup);
    expect(resourceGroup!.compareDocumentPosition(diagnosticGroup!))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(element.textContent).toContain('Results may be incomplete.');
    expect(element.textContent).toContain('403: Forbidden');
    expect(element.querySelector('app-resource-card')).not.toBeNull();
    fixture.destroy();
    expect(response.observed).toBeFalse();
  });

  it('does not wait for the activity log before showing monitoring resources', () => {
    const resourceResponse = new Subject<MonitoringResource[]>();
    const activityResponse = new Subject<ActivityLogEvent[]>();
    monitoring.getMonitoringResources.and.returnValue(resourceResponse);
    monitoring.getActivityLog.and.returnValue(activityResponse);

    const fixture = TestBed.createComponent(MonitoringPerspectiveComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.loading).toBeTrue();
    expect(fixture.componentInstance.loadingActivity).toBeTrue();

    resourceResponse.next([{
      id: '/subscriptions/test/resourceGroups/logs/providers/Microsoft.Insights/components/app',
      name: 'app',
      type: 'Microsoft.Insights/components',
      resourceGroup: 'logs',
      location: 'westeurope',
      category: 'Application Insights'
    }]);
    fixture.detectChanges();

    expect(fixture.componentInstance.loading).toBeFalse();
    expect(fixture.componentInstance.loadingActivity).toBeTrue();
    expect(fixture.nativeElement.textContent).not.toContain('Loading monitoring resources...');

    fixture.componentInstance.selectTab('activity');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading activity log...');

    activityResponse.next([]);
    fixture.detectChanges();
    expect(fixture.componentInstance.loadingActivity).toBeFalse();
    fixture.destroy();
  });

  it('opens the metrics view for a linked resource without changing shared selection', () => {
    const resourceId = '/subscriptions/00000000-0000-0000-0000-000000000001'
      + '/resourceGroups/apps/providers/Microsoft.Web/sites/orders';
    const sharedResource = {
      id: '/subscriptions/00000000-0000-0000-0000-000000000001'
        + '/resourceGroups/apps/providers/Microsoft.Compute/virtualMachines/shared-vm',
      name: 'shared-vm',
      type: 'Microsoft.Compute/virtualMachines',
      resourceGroup: 'apps'
    };
    TestBed.inject(ResourceSelectionService).select(sharedResource);
    graph.getResourceDetails.and.returnValue(of({
      id: resourceId,
      name: 'orders',
      type: 'Microsoft.Web/sites',
      resourceGroup: 'apps'
    }));

    const fixture = TestBed.createComponent(MonitoringPerspectiveComponent);
    fixture.detectChanges();
    queryParamMap.next(convertToParamMap({ resourceId }));
    fixture.detectChanges();

    expect(fixture.componentInstance.activeTab).toBe('metrics');
    expect(fixture.componentInstance.linkedMetricResource).toEqual({
      id: resourceId,
      name: 'orders',
      type: 'Microsoft.Web/sites',
      resourceGroup: 'apps'
    });
    const metricsView = fixture.debugElement.query(By.directive(MetricsComponent))
      .componentInstance as MetricsComponent;
    const mainMetricsTab = fixture.nativeElement.querySelector('.monitoring-tabs #metrics-tab');
    const metricsSubTabs = fixture.nativeElement.querySelector('.metrics-view .metric-tabs');
    expect(metricsView.metricView).toBe('explorer');
    expect(metricsView.selectedExplorerResourceIds).toEqual([resourceId]);
    expect(mainMetricsTab.compareDocumentPosition(metricsSubTabs)
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(TestBed.inject(ResourceSelectionService).selectedResources).toEqual([sharedResource]);
    fixture.destroy();
  });

  it('rejects unsafe resource IDs before resolving a deep link', () => {
    const fixture = TestBed.createComponent(MonitoringPerspectiveComponent);
    fixture.detectChanges();
    queryParamMap.next(convertToParamMap({
      resourceId: '/subscriptions/00000000-0000-0000-0000-000000000001'
        + "/resourceGroups/apps/providers/Microsoft.Web/sites/orders'|take 1"
    }));

    expect(graph.getResourceDetails).not.toHaveBeenCalled();
    expect(fixture.componentInstance.linkedMetricResourceError)
      .toContain('not a valid Azure resource ID');
    fixture.destroy();
  });
});
