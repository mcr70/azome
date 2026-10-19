import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ResourceDetailHostComponent } from '@components/resources/resource-detail-host.component';
import { ResourceDetailRegistryService } from '@services/azome/resource-detail.registry';
import { LogAnalyticsWorkspaceComponent } from './log-analytics-workspace.component';

describe('LogAnalyticsWorkspaceComponent', () => {
  let fixture: ComponentFixture<LogAnalyticsWorkspaceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LogAnalyticsWorkspaceComponent, ResourceDetailHostComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(LogAnalyticsWorkspaceComponent);
  });

  function rowValue(label: string): string | undefined {
    const element: HTMLElement = fixture.nativeElement;
    const rows = Array.from(element.querySelectorAll('tr'));
    return rows.find((row) => row.querySelector('th')?.textContent?.trim() === label)
      ?.querySelector('td')?.textContent?.trim();
  }

  it('renders workspace control-plane settings', () => {
    fixture.componentRef.setInput('resource', {
      properties: {
        customerId: 'workspace-id',
        provisioningState: 'Succeeded',
        sku: { name: 'CapacityReservation', capacityReservationLevel: 100 },
        retentionInDays: 30,
        workspaceCapping: { dailyQuotaGb: 5, dataIngestionStatus: 'RespectQuota' },
        publicNetworkAccessForIngestion: 'Disabled',
        publicNetworkAccessForQuery: 'Enabled',
        features: { enableLogAccessUsingOnlyResourcePermissions: true }
      }
    });
    fixture.detectChanges();

    expect(rowValue('Workspace ID')).toBe('workspace-id');
    expect(rowValue('Provisioning state')).toBe('Succeeded');
    expect(rowValue('Pricing tier')).toBe('CapacityReservation');
    expect(rowValue('Capacity reservation')).toBe('100 GB/day');
    expect(rowValue('Default retention')).toBe('30 days');
    expect(rowValue('Daily ingestion cap')).toBe('5 GB/day');
    expect(rowValue('Data ingestion status')).toBe('RespectQuota');
    expect(rowValue('Public network access for ingestion')).toBe('Disabled');
    expect(rowValue('Public network access for queries')).toBe('Enabled');
    expect(rowValue('Access control mode')).toBe('Use resource or workspace permissions');
  });

  it('preserves zero values and distinguishes false from missing settings', () => {
    fixture.componentRef.setInput('resource', {
      properties: {
        retentionInDays: 0,
        workspaceCapping: { dailyQuotaGb: 0 },
        features: { enableLogAccessUsingOnlyResourcePermissions: false }
      }
    });
    fixture.detectChanges();

    expect(rowValue('Default retention')).toBe('0 days');
    expect(rowValue('Daily ingestion cap')).toBe('0 GB/day');
    expect(rowValue('Access control mode')).toBe('Require workspace permissions');
    expect(rowValue('Public network access for queries')).toBe('-');
    expect(rowValue('Capacity reservation')).toBeUndefined();
  });

  it('renders the unlimited cap and updates when the selected resource changes', () => {
    fixture.componentRef.setInput('resource', {
      properties: { workspaceCapping: { dailyQuotaGb: -1 } }
    });
    fixture.detectChanges();
    expect(rowValue('Daily ingestion cap')).toBe('Unlimited');

    fixture.componentRef.setInput('resource', { properties: {} });
    fixture.detectChanges();
    expect(rowValue('Daily ingestion cap')).toBe('-');
    expect(rowValue('Access control mode')).toBe('-');
  });

  it('handles missing resource properties without inventing settings', () => {
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('No Log Analytics workspace details available.');
    expect(element.querySelector('table')).toBeNull();
  });

  it('registers the workspace type case-insensitively and renders through the detail host', () => {
    const registry = TestBed.inject(ResourceDetailRegistryService);
    expect(registry.getComponent('Microsoft.OperationalInsights/workspaces'))
      .toBe(LogAnalyticsWorkspaceComponent);

    const hostFixture = TestBed.createComponent(ResourceDetailHostComponent);
    hostFixture.componentRef.setInput('resource', {
      type: 'Microsoft.OperationalInsights/workspaces',
      properties: { customerId: 'host-workspace-id' }
    });
    hostFixture.detectChanges();
    const element: HTMLElement = hostFixture.nativeElement;
    expect(element.querySelector('app-log-analytics-workspace-detail')).not.toBeNull();
    expect(element.textContent).toContain('host-workspace-id');
    expect(element.textContent).not.toContain('Customized component not found');

    hostFixture.componentInstance.setTab('json');
    hostFixture.detectChanges();
    expect(element.querySelector('.json-view')?.textContent).toContain('host-workspace-id');
  });
});
