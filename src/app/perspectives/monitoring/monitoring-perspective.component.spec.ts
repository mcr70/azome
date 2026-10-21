import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { DiagnosticSetting, DiagnosticSettingsResult } from '@services/azure/diagnostic-settings.model';
import { DiagnosticSettingsService } from '@services/azure/diagnostic-settings.service';
import { MonitoringService } from '@services/azure/monitoring.service';
import { LogAnalyticsService } from '@services/azure/log-analytics.service';
import { ResourceGraphService } from '@services/azure/resource-graph.service';
import { ResourceDetailPanelService } from '@services/azome/resource-detail-panel.service';
import { MonitoringPerspectiveComponent } from './monitoring-perspective.component';

describe('MonitoringPerspectiveComponent diagnostic settings', () => {
  let diagnostics: jasmine.SpyObj<DiagnosticSettingsService>;
  let graph: jasmine.SpyObj<ResourceGraphService>;
  let monitoring: jasmine.SpyObj<MonitoringService>;
  let logs: jasmine.SpyObj<LogAnalyticsService>;
  let panelService: ResourceDetailPanelService;
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
    logs = jasmine.createSpyObj<LogAnalyticsService>(
      'LogAnalyticsService', ['getTables', 'getActiveTableNames']
    );
    logs.getTables.and.returnValue(of([]));
    logs.getActiveTableNames.and.returnValue(of([]));
    monitoring.getMonitoringResources.and.returnValue(of([]));
    monitoring.getActivityLog.and.returnValue(of([]));
    await TestBed.configureTestingModule({
      imports: [MonitoringPerspectiveComponent],
      providers: [
        { provide: MonitoringService, useValue: monitoring },
        { provide: LogAnalyticsService, useValue: logs },
        { provide: DiagnosticSettingsService, useValue: diagnostics },
        { provide: ResourceGraphService, useValue: graph }
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
});
