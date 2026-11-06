import { Component, OnDestroy, OnInit } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { LucideDynamicIcon, LucideSearch } from '@lucide/angular';
import { ActivatedRoute } from '@angular/router';
import { KqlComponent } from '@components/kql/kql.component';
import { Subject, Subscription } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import {
  ActivityLogEvent,
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
import {
  groupResourcesByCategory,
  PerspectiveResourceCategoryGroup
} from '../perspective-resource-groups';
import { selectFloatingPanel, selectPinnedPanels } from '../perspective-utils';
import { ActivityLogComponent } from './activity-log/activity-log.component';
import { LinkedMetricResourceService } from './linked-metric-resource.service';
import { MetricsComponent } from './metrics/metrics.component';
import { monitoringResourceTypeLabel } from './monitoring-resource-labels';
import { DiagnosticSettingsService } from '@services/azure/diagnostic-settings.service';
import { DiagnosticSetting, DiagnosticSettingsResult } from '@services/azure/diagnostic-settings.model';
import { ResourceDetailsActionComponent } from '@app/components/resource-card/actions/resource-details-action.component';

type MonitoringTab = 'overview' | 'metrics' | 'activity';

/**
 * Shell of the Monitoring perspective.
 *
 * Orchestrates the overview, metrics, and activity log tabs, loads the
 * monitoring resource inventory and diagnostic settings, and resolves
 * deep links into the Metrics view via {@link LinkedMetricResourceService}.
 */
@Component({
  selector: 'app-monitoring-perspective',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    LucideDynamicIcon,
    KqlComponent,
    ActivityLogComponent,
    MetricsComponent,
    ResourceCardComponent,
    ResourceGridSelectionComponent,
    ResourceDetailPaneComponent,
    ResourceSelectionBarComponent,
    TextFilterComponent,
    ResourceDetailsActionComponent
],
  templateUrl: './monitoring-perspective.component.html',
  styleUrls: ['../perspective-shared.scss', './monitoring-perspective.component.scss']
})
export class MonitoringPerspectiveComponent implements OnInit, OnDestroy {
  public readonly searchIcon = LucideSearch.icon;
  public kqlWorkspace: { id: string; name: string } | null = null;
  public activeTab: MonitoringTab = 'overview';
  public resources: MonitoringResource[] = [];
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
    private readonly linkedResource: LinkedMetricResourceService,
    private readonly route: ActivatedRoute
  ) {}

  /**
   * Subscribes to shared selection and panel state, watches the `resourceId`
   * query parameter for metric deep links, and loads the monitoring data.
   */
  public ngOnInit(): void {
    if (this.route.routeConfig?.path === 'monitoring/metrics') {
      this.activeTab = 'metrics';
    }

    this.resourceSelection.selectedResources$
      .pipe(takeUntil(this.destroy$))
      .subscribe((resources) => this.selectedResources = resources);
    this.panelService.panels$
      .pipe(takeUntil(this.destroy$))
      .subscribe((panels) => this.panels = panels);
    this.watchLinkedMetricResource();
    this.loadMonitoringData();
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Monitoring resources matching the current text filter. */
  public get filteredResources(): MonitoringResource[] {
    return this.resources.filter((resource) =>
      matchesTextFilter(this.filterQuery, resource.resourceGroup, resource.name, resource.type)
    );
  }

  /** Diagnostic settings matching the current text filter. */
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

  /** Filtered resources grouped into sorted category and type sections. */
  public get categoryGroups(): PerspectiveResourceCategoryGroup<
    MonitoringResource['category'],
    MonitoringResource
  >[] {
    return groupResourcesByCategory(
      this.filteredResources,
      (resource) => resource.category,
      (resource) => resource.type,
      (type) => this.resourceTypeLabel(type)
    );
  }

  /** Panels pinned into the side-by-side slots. */
  public get pinnedPanels(): ResourcePanelConfig[] {
    return selectPinnedPanels(this.panels);
  }

  /** The floating resource details panel, if one is open. */
  public get floatingPanel(): ResourcePanelConfig | null {
    return selectFloatingPanel(this.panels);
  }

  /**
   * Loads the monitoring resources, diagnostic settings, and activity log. The
   * three requests are independent so each section renders as soon as its own
   * data arrives.
   */
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

  /** Discovers diagnostic settings, replacing any discovery still in flight. */
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

  /**
   * Activates a monitoring tab.
   *
   * @param tab Tab to activate.
   */
  public selectTab(tab: MonitoringTab): void {
    this.activeTab = tab;
  }

  /**
   * Opens the KQL dialog for a Log Analytics workspace card.
   *
   * @param resource Workspace resource whose card action was clicked.
   * @param event Click event; prevented so the card selection does not change.
   */
  public openWorkspaceQuery(resource: MonitoringResource, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const workspaceId = resource.properties?.customerId;
    if (workspaceId) {
      this.kqlWorkspace = { id: workspaceId, name: resource.name };
    }
  }

  /**
   * Opens the resource details panel for a monitoring resource. Diagnostic
   * settings already hold their full payload and open without a Graph query;
   * stale responses are ignored when the user clicks another card meanwhile.
   *
   * @param resourceId ARM resource ID of the clicked resource.
   * @param event Optional click event; prevented to keep the card selection.
   */
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

  /**
   * Returns the display label for a monitoring resource type.
   *
   * @param type Full Azure resource type.
   * @returns A friendly label, falling back to the last type segment.
   */
  public resourceTypeLabel(type: string): string {
    return monitoringResourceTypeLabel(type);
  }

  /**
   * Closes a resource details panel.
   *
   * @param panelId Identifier of the panel to close.
   */
  public closePanel(panelId: string): void {
    this.panelService.closePanel(panelId);
  }

  /**
   * Changes the pinned state of a resource details panel.
   *
   * @param panelId Identifier of the panel to pin or unpin.
   */
  public togglePanelPin(panelId: string): void {
    this.panelService.togglePin(panelId);
  }

  /**
   * Mirrors the `resourceId` query parameter into the linked metric resource
   * state and switches to the Metrics tab whenever a deep link arrives.
   */
  private watchLinkedMetricResource(): void {
    this.route.queryParamMap
      .pipe(
        switchMap((params) => {
          const resourceId = params.get('resourceId');

          if (resourceId) {
            this.activeTab = 'metrics';
          }

          return this.linkedResource.resolve(resourceId);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((state) => {
        this.linkedMetricResource = state.resource;
        this.linkedMetricResourceError = state.error;
        this.linkedMetricResourceLoading = state.loading;
      });
  }
}
