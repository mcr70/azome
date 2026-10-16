import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ActivityLogEvent, LogAnalyticsWorkspace, MonitoringService } from '@services/azure/monitoring.service';
import { ResourceSelectionBarComponent } from '@components/resource-selection-bar.component';
import { SelectedAzureResource, ResourceSelectionService } from '@services/azome/resource-selection.service';
import { ActivityLogComponent } from './activity-log/activity-log.component';
import { LogAnalyticsComponent } from './log-analytics/log-analytics.component';

@Component({
  selector: 'app-monitoring-perspective',
  standalone: true,
  imports: [ActivityLogComponent, LogAnalyticsComponent, ResourceSelectionBarComponent],
  templateUrl: './monitoring-perspective.component.html',
  styleUrl: './monitoring-perspective.component.scss'
})
export class MonitoringPerspectiveComponent implements OnInit, OnDestroy {
  public activeTab: 'activity' | 'log-analytics' = 'activity';
  public workspaces: LogAnalyticsWorkspace[] = [];
  public activityEvents: ActivityLogEvent[] = [];
  public loading = false;
  public error: string | null = null;
  public selectedResources: SelectedAzureResource[] = [];
  private readonly destroy$ = new Subject<void>();

  constructor(
    private monitoring: MonitoringService,
    private resourceSelection: ResourceSelectionService
  ) {}

  ngOnInit(): void {
    this.resourceSelection.selectedResources$
      .pipe(takeUntil(this.destroy$))
      .subscribe((resources) => this.selectedResources = resources);
    this.loadMonitoringData();
  }

  public loadMonitoringData(): void {
    this.loading = true;
    this.error = null;
    forkJoin({
      workspaces: this.monitoring.getWorkspaces(),
      activity: this.monitoring.getActivityLog()
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ workspaces, activity }) => {
        this.workspaces = workspaces;
        this.activityEvents = activity.sort((a, b) =>
          new Date(b.eventTimestamp).getTime() - new Date(a.eventTimestamp).getTime()
        );
        this.loading = false;
      },
      error: (error: unknown) => {
        console.error('Failed to load monitoring data:', error);
        this.error = 'Monitoring data could not be loaded. Check that your account has Reader access to this subscription.';
        this.loading = false;
      }
    });
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
