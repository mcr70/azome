import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ResourceDetailHostComponent } from '../resource-detail-host.component';
import { DiagnosticSetting } from '@services/azure/diagnostic-settings.model';
import { LogAnalyticsService } from '@services/azure/log-analytics.service';
import { ResourceGraphApiService } from '@services/azure/resource-graph-api.service';
import { DiagnosticSettingsComponent } from './diagnostic-settings.component';

describe('DiagnosticSettingsComponent', () => {
  const setting: DiagnosticSetting = {
    id: '/sources/app/providers/Microsoft.Insights/diagnosticSettings/export',
    name: 'export',
    type: 'Microsoft.Insights/diagnosticSettings',
    source: { id: '/sources/app', name: 'orders', type: 'Microsoft.Web/sites' },
    destinations: [
      { label: 'Log Analytics workspace', id: '/workspaces/law', name: 'law' },
      { label: 'Storage account', id: '/storageAccounts/archive', name: 'archive' },
      {
        label: 'Event Hubs authorization rule',
        id: '/namespaces/events/authorizationRules/send',
        name: 'events/authorizationRules/send',
        eventHubName: 'logs'
      }
    ],
    properties: {
      workspaceId: '/workspaces/law',
      logAnalyticsDestinationType: 'Dedicated',
      logs: [
        { categoryGroup: 'allLogs', enabled: true },
        { category: 'AppServiceHTTPLogs', enabled: false }
      ],
      metrics: [{ category: 'AllMetrics', enabled: false }]
    }
  };

  let logAnalyticsSpy: jasmine.SpyObj<LogAnalyticsService>;
  let resourceGraphSpy: jasmine.SpyObj<ResourceGraphApiService>;

  beforeEach(async () => {
    logAnalyticsSpy = jasmine.createSpyObj<LogAnalyticsService>('LogAnalyticsService', [
      'getTables',
      'getActiveTableNames',
      'query'
    ]);
    logAnalyticsSpy.getTables.and.returnValue(of([
      { name: 'AppServiceConsoleLogs', columns: [{ name: 'TimeGenerated', type: 'datetime' }] }
    ]));
    logAnalyticsSpy.getActiveTableNames.and.returnValue(of(['AppServiceConsoleLogs']));
    logAnalyticsSpy.query.and.returnValue(of({ tables: [] }));

    resourceGraphSpy = jasmine.createSpyObj<ResourceGraphApiService>('ResourceGraphApiService', ['query']);
    resourceGraphSpy.query.and.returnValue(of({
      data: [{ name: 'law', customerId: '11111111-2222-3333-4444-555555555555' }]
    }));

    await TestBed.configureTestingModule({
      imports: [DiagnosticSettingsComponent, ResourceDetailHostComponent],
      providers: [
        { provide: LogAnalyticsService, useValue: logAnalyticsSpy },
        { provide: ResourceGraphApiService, useValue: resourceGraphSpy }
      ]
    }).compileComponents();
  });

  it('renders source and all destinations with configured details', () => {
    const fixture = TestBed.createComponent(DiagnosticSettingsComponent);
    fixture.componentRef.setInput('resource', setting);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('orders');
    for (const destination of setting.destinations) {
      expect(element.textContent).toContain(destination.name);
    }
    expect(element.textContent).toContain('Event hub: logs');
    expect(element.textContent).toContain('Resource-specific tables');
    const rows = Array.from(element.querySelectorAll('tbody tr'));
    expect(rows[0].textContent).toContain('allLogs');
    expect(rows[0].textContent).toContain('Enabled');
    expect(rows[1].textContent).toContain('Disabled');
  });

  it('renders enabled log category as a link when Log Analytics destination is present', () => {
    const fixture = TestBed.createComponent(DiagnosticSettingsComponent);
    fixture.componentRef.setInput('resource', setting);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;

    const links = element.querySelectorAll<HTMLButtonElement>('.category-link');
    expect(links.length).toBe(1);
    expect(links[0].textContent?.trim()).toBe('allLogs');

    const rows = element.querySelectorAll('tbody tr');
    // First row is enabled -> has button link
    expect(rows[0].querySelector('.category-link')).not.toBeNull();
    // Second row is disabled -> no button link
    expect(rows[1].querySelector('.category-link')).toBeNull();
  });

  it('does not render category as a link when Log Analytics destination is missing', () => {
    const settingWithoutLaw: DiagnosticSetting = {
      ...setting,
      destinations: [{ label: 'Storage account', id: '/storageAccounts/archive', name: 'archive' }],
      properties: {
        ...setting.properties,
        workspaceId: undefined
      }
    };
    const fixture = TestBed.createComponent(DiagnosticSettingsComponent);
    fixture.componentRef.setInput('resource', settingWithoutLaw);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;

    const links = element.querySelectorAll<HTMLButtonElement>('.category-link');
    expect(links.length).toBe(0);
  });

  it('opens KQL editor with prefilled query for source resource when category link is clicked', () => {
    const fixture = TestBed.createComponent(DiagnosticSettingsComponent);
    fixture.componentRef.setInput('resource', setting);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;

    const link = element.querySelector<HTMLButtonElement>('.category-link');
    expect(link).not.toBeNull();
    link?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.kqlDialogOpen).toBeTrue();
    expect(fixture.componentInstance.kqlWorkspaceId).toBe('11111111-2222-3333-4444-555555555555');
    expect(fixture.componentInstance.kqlTargetResource).toEqual({
      id: '/sources/app',
      name: 'orders',
      type: 'Microsoft.Web/sites',
      resourceGroup: ''
    });

    const kqlDialog = element.querySelector('app-kql');
    expect(kqlDialog).not.toBeNull();

    fixture.componentInstance.closeKqlDialog();
    fixture.detectChanges();
    expect(fixture.componentInstance.kqlDialogOpen).toBeFalse();
    expect(element.querySelector('app-kql')).toBeNull();
  });

  it('renders the custom component via the registry and preserves JSON access', () => {
    const fixture = TestBed.createComponent(ResourceDetailHostComponent);
    fixture.componentRef.setInput('resource', setting);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('app-diagnostic-settings-detail')).not.toBeNull();
    expect(element.textContent).not.toContain('Customized component not found');
    fixture.componentInstance.setTab('json');
    fixture.detectChanges();
    expect(element.querySelector('pre')?.textContent).toContain('allLogs');
  });

  it('handles missing destinations and categories explicitly', () => {
    const fixture = TestBed.createComponent(DiagnosticSettingsComponent);
    fixture.componentRef.setInput('resource', { ...setting, destinations: [], properties: {} });
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('No destinations configured.');
    expect(element.textContent).toContain('No log or metric categories configured.');
  });
});
