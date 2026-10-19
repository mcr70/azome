import { TestBed } from '@angular/core/testing';
import { ResourceDetailHostComponent } from '../resource-detail-host.component';
import { DiagnosticSetting } from '@services/azure/diagnostic-settings.model';
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
      logs: [{ categoryGroup: 'allLogs', enabled: true }],
      metrics: [{ category: 'AllMetrics', enabled: false }]
    }
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DiagnosticSettingsComponent, ResourceDetailHostComponent]
    }).compileComponents();
  });

  it('renders source and all destinations with full IDs and safe portal links', () => {
    const fixture = TestBed.createComponent(DiagnosticSettingsComponent);
    fixture.componentRef.setInput('resource', setting);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('orders');
    expect(element.textContent).toContain('/sources/app');
    for (const destination of setting.destinations) {
      expect(element.textContent).toContain(destination.id);
    }
    expect(element.textContent).toContain('Event hub: logs');
    expect(element.textContent).toContain('Resource-specific tables');
    expect(element.querySelectorAll('a').length).toBe(4);
    expect(element.querySelector('a')?.href).toBe('https://portal.azure.com/#resource/sources/app');
    expect(element.querySelector('a')?.rel).toBe('noopener noreferrer');
    const rows = Array.from(element.querySelectorAll('tbody tr'));
    expect(rows[0].textContent).toContain('allLogs');
    expect(rows[0].textContent).toContain('Enabled');
    expect(rows[1].textContent).toContain('Disabled');
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
