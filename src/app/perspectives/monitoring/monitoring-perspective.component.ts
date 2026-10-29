import { Component, OnDestroy, OnInit } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { LucideDynamicIcon, LucideSearch } from '@lucide/angular';
import { ActivatedRoute } from '@angular/router';
import { KqlComponent } from '@components/kql/kql.component';
import { of, Subject, Subscription } from 'rxjs';
import { catchError, map, switchMap, takeUntil } from 'rxjs/operators';
import {
  ActivityLogEvent,
  LogAnalyticsWorkspace,
  MonitoringResource,
  MonitoringService
} from '@services/azure/monitoring.service';
import { ResourceSelectionBarComponent } from '@components/resource-selection-bar.component';
import { ResourceCardComponent } from '@components/resource-card/resource-card.component';
import { ResourceGridSelectionComponent } from '@components/resource-grid-selection/resource-grid-selection.component';
import { ResourceDetailPaneComponent } from '@components/resources/resource-detail-pane.component';
import { TextFilterComponent } from '@components/text-filter/text-filter.component';
import { SelectedAzureResource, ResourceSelectionService } from '@services/azome/resource-selection.service';
import {
  AzureResourceDetail,
  ResourceGraphService
} from '@services/azure/resource-graph.service';
import {
  ResourceDetailPanelService,
  ResourcePanelConfig
} from '@services/azome/resource-detail-panel.service';
import { matchesTextFilter } from '@app/utils/text-filter';
import { ActivityLogComponent } from './activity-log/activity-log.component';
import { LogAnalyticsComponent } from './log-analytics/log-analytics.component';
import { MetricsComponent } from './metrics/metrics.component';
import { DiagnosticSettingsService } from '@services/azure/diagnostic-settings.service';
import { DiagnosticSetting, DiagnosticSettingsResult } from '@services/azure/diagnostic-settings.model';

interface MonitoringResourceTypeGroup {
  type: string;
  label: string;
  resources: MonitoringResource[];
}

interface MonitoringResourceCategoryGroup {
  category: MonitoringResource['category'];
  types: MonitoringResourceTypeGroup[];
}

@Component({
  selector: 'app-monitoring-perspective',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    LucideDynamicIcon,
    KqlComponent,
    ActivityLogComponent,
    LogAnalyticsComponent,
    MetricsComponent,
    ResourceCardComponent,
    ResourceGridSelectionComponent,
    ResourceDetailPaneComponent,
    ResourceSelectionBarComponent,
    TextFilterComponent
  ],
  templateUrl: './monitoring-perspective.component.html',
  styleUrl: './monitoring-perspective.component.scss'
})
export class MonitoringPerspectiveComponent implements OnInit, OnDestroy {
  public readonly searchIcon = LucideSearch.icon;
  public kqlWorkspace: { id: string; name: string } | null = null;
  public activeTab: 'overview' | 'metrics' | 'log-analytics' | 'activity' = 'overview';
  public resources: MonitoringResource[] = [];
  public workspaces: LogAnalyticsWorkspace[] = [];
  public activityEvents: ActivityLogEvent[] = [];
  public loadingActivity = false;
  public activityError: string | null = null;
  public loading = false;
  public error: string | null = null;
  public filterQuery = '';
  public panels: ResourcePanelConfig[] = [];
  public selectedResources: SelectedAzureResource[] = [];
  public diagnosticSettings: DiagnosticSetting[] = [];
  public diagnosticFailures: DiagnosticSettingsResult['failures'] = [];
  public loadingDiagnostics = false;
  public diagnosticError: string | null = null;
  public linkedMetricResource: SelectedAzureResource | null = null;
  public linkedMetricResourceLoading = false;
  public linkedMetricResourceError: string | null = null;

  private readonly destroy$ = new Subject<void>();
  private detailRequestId = 0;
  private diagnosticRequest?: Subscription;
  private activityRequest?: Subscription;

  constructor(
    private readonly monitoring: MonitoringService,
    private readonly resourceSelection: ResourceSelectionService,
    private readonly panelService: ResourceDetailPanelService,
    private readonly resourceGraph: ResourceGraphService,
    private readonly diagnostics: DiagnosticSettingsService,
    private readonly route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    if (this.route.routeConfig?.path === 'monitoring/metrics') {
      this.activeTab = 'metrics';
    }

    this.resourceSelection.selectedResources$
      .pipe(takeUntil(this.destroy$))
      .subscribe((resources) => this.selectedResources = resources);
    this.panelService.panels$
      .pipe(takeUntil(this.destroy$))
      .subscribe((panels) => this.panels = panels);
    this.route.queryParamMap
      .pipe(
        switchMap((params) => {
          const resourceId = params.get('resourceId');
          this.linkedMetricResource = null;
          this.linkedMetricResourceError = null;

          if (!resourceId) {
            this.linkedMetricResourceLoading = false;
            return of(null);
          }

          this.activeTab = 'metrics';
          this.linkedMetricResourceLoading = true;

          if (!this.isSafeResourceId(resourceId)) {
            this.linkedMetricResourceError = 'The linked resource ID is not a valid Azure resource ID.';
            this.linkedMetricResourceLoading = false;
            return of(null);
          }

          return this.resourceGraph.getResourceDetails(resourceId).pipe(
            map((resource) => ({ resourceId, resource, error: null as string | null })),
            catchError((error: unknown) => {
              console.error('Failed to resolve linked metrics resource:', error);
              return of({
                resourceId,
                resource: null,
                error: 'The linked resource could not be resolved. Check your Azure access.'
              });
            })
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((result) => {
        if (!result) {
          return;
        }

        this.linkedMetricResourceLoading = false;
        if (result.resource) {
          this.linkedMetricResource = {
            id: result.resource.id,
            name: result.resource.name,
            type: result.resource.type,
            resourceGroup: result.resource.resourceGroup ?? ''
          };
        } else {
          this.linkedMetricResourceError = result.error
            ?? `The resource ${result.resourceId} was not found in the configured subscription.`;
        }
      });
    this.loadMonitoringData();
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  
  public get filteredResources(): MonitoringResource[] {
    return this.resources.filter((resource) =>
      matchesTextFilter(this.filterQuery, resource.resourceGroup, resource.name, resource.type)
    );
  }

  public get filteredDiagnosticSettings(): DiagnosticSetting[] {
    return this.diagnosticSettings.filter((setting) =>
      matchesTextFilter(
        this.filterQuery,
        setting.name,
        setting.type,
        setting.source.id,
        setting.source.name,
        ...setting.destinations.map((destination) => `${destination.id} ${destination.eventHubName ?? ''}`)
      )
    );
  }

  public get categoryGroups(): MonitoringResourceCategoryGroup[] {
    const categories = new Map<
      MonitoringResource['category'],
      Map<string, MonitoringResource[]>
    >();

    for (const resource of this.filteredResources) {
      const categoryTypes = categories.get(resource.category)
        ?? new Map<string, MonitoringResource[]>();
      const resourceType = resource.type.toLowerCase();
      const typeResources = categoryTypes.get(resourceType) ?? [];

      typeResources.push(resource);
      categoryTypes.set(resourceType, typeResources);
      categories.set(resource.category, categoryTypes);
    }

    return Array.from(categories.entries())
      .sort(([categoryA], [categoryB]) => categoryA.localeCompare(categoryB))
      .map(([category, types]) => ({
        category,
        types: Array.from(types.entries())
          .sort(([typeA], [typeB]) => typeA.localeCompare(typeB))
          .map(([type, resources]) => ({
            type,
            label: this.resourceTypeLabel(type),
            resources
          }))
      }));
  }

  public get pinnedPanels(): ResourcePanelConfig[] {
    return this.panels.filter((panel) => panel.pinned);
  }

  public get floatingPanel(): ResourcePanelConfig | null {
    return this.panels.find((panel) => !panel.pinned) ?? null;
  }


  public loadMonitoringData(): void {
    this.loadDiagnosticSettings();
    this.loading = true;
    this.error = null;
    this.loadingActivity = true;
    this.activityError = null;

    this.monitoring.getMonitoringResources()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (resources) => {
          this.resources = resources;
          this.workspaces = resources
            .filter((resource) => resource.type.toLowerCase()
              === 'microsoft.operationalinsights/workspaces')
            .map((resource) => ({
              id: resource.id,
              name: resource.name,
              resourceGroup: resource.resourceGroup,
              location: resource.location,
              properties: {
                customerId: resource.properties?.customerId,
                retentionInDays: resource.properties?.retentionInDays
              }
            }));
          this.loading = false;
        },
        error: (error: unknown) => {
          console.error('Failed to load monitoring resources:', error);
          this.error = 'Monitoring resources could not be loaded. '
            + 'Check that your account has Reader access to this subscription.';
          this.loading = false;
        }
      });

    this.activityRequest?.unsubscribe();
    this.activityRequest = this.monitoring.getActivityLog()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (activity) => {
          this.activityEvents = activity.sort((a, b) =>
            new Date(b.eventTimestamp).getTime() - new Date(a.eventTimestamp).getTime()
          );
          this.loadingActivity = false;
        },
        error: (error: unknown) => {
          console.error('Failed to load activity log:', error);
          this.activityError = 'Activity log could not be loaded. '
            + 'Check that your account has Reader access to this subscription.';
          this.loadingActivity = false;
        }
      });
  }

  public loadDiagnosticSettings(): void {
    this.diagnosticRequest?.unsubscribe();
    this.loadingDiagnostics = true;
    this.diagnosticError = null;
    this.diagnosticSettings = [];
    this.diagnosticFailures = [];
    this.diagnosticRequest = this.diagnostics.getDiagnosticSettings()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.diagnosticSettings = result.settings;
          this.diagnosticFailures = result.failures;
          this.loadingDiagnostics = false;
        },
        error: (error: unknown) => {
          console.error('Failed to discover diagnostic settings:', error);
          this.diagnosticError = 'Diagnostic settings could not be discovered. Check your subscription access.';
          this.loadingDiagnostics = false;
        }
      });
  }

  public selectTab(tab: 'overview' | 'metrics' | 'log-analytics' | 'activity'): void {
    this.activeTab = tab;
  }

  private isSafeResourceId(resourceId: string): boolean {
    return /^\/subscriptions\/[a-f0-9-]+\/resourceGroups\/[a-zA-Z0-9._()-]+\/providers\/[a-zA-Z0-9.]+(?:\/[a-zA-Z0-9._()-]+)+$/i
      .test(resourceId);
  }

  public openWorkspaceQuery(resource: MonitoringResource, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const workspaceId = resource.properties?.customerId;
    if (workspaceId) {
      this.kqlWorkspace = { id: workspaceId, name: resource.name };
    }
  }

  public openResourceDetails(resourceId: string, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    const requestId = ++this.detailRequestId;
    const diagnostic = this.diagnosticSettings.find((setting) => setting.id === resourceId);
    if (diagnostic) {
      this.panelService.openPanel(diagnostic);
      return;
    }
    this.resourceGraph.getResourceDetails(resourceId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (details: AzureResourceDetail | null) => {
          if (requestId !== this.detailRequestId) {
            return;
          }

          if (details) {
            this.panelService.openPanel(details);
          }
        },
        error: (error: unknown) => {
          if (requestId !== this.detailRequestId) {
            return;
          }

          console.error('Failed to fetch monitoring resource details:', error);
        }
      });
  }

  public resourceTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      'microsoft.insights/actiongroups': 'Action groups',
      'microsoft.insights/activitylogalerts': 'Activity log alerts',
      'microsoft.insights/autoscalesettings': 'Autoscale settings',
      'microsoft.insights/components': 'Application Insights',
      'microsoft.insights/datacollectionendpoints': 'Data collection endpoints',
      'microsoft.insights/datacollectionrules': 'Data collection rules',
      'microsoft.insights/diagnosticsettings': 'Diagnostic settings',
      'microsoft.insights/logprofiles': 'Log profiles',
      'microsoft.insights/metricalerts': 'Metric alerts',
      'microsoft.insights/scheduledqueryrules': 'Scheduled query rules',
      'microsoft.insights/smartdetectoralertrules': 'Smart detector alert rules',
      'microsoft.insights/webtests': 'Availability tests',
      'microsoft.insights/workbooks': 'Workbooks',
      'microsoft.alertsmanagement/actionrules': 'Alert processing rules',
      'microsoft.dashboard/grafana': 'Azure Managed Grafana',
      'microsoft.operationalinsights/dataexports': 'Data exports',
      'microsoft.operationalinsights/savedsearches': 'Saved searches',
      'microsoft.operationalinsights/workspaces': 'Log Analytics workspaces'
    };

    return labels[type.toLowerCase()] ?? type.split('/').pop() ?? type;
  }

  public closePanel(panelId: string): void {
    this.panelService.closePanel(panelId);
  }

  public togglePanelPin(panelId: string): void {
    this.panelService.togglePin(panelId);
  }

}
