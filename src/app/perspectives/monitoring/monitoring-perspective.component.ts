import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ActivityLogEvent, LogAnalyticsWorkspace, MonitoringService } from '../../services/azure/monitoring.service';
import { ActivityLogDetailComponent } from './activity-log-detail.component';

@Component({
  selector: 'app-monitoring-perspective',
  standalone: true,
  imports: [CommonModule, ActivityLogDetailComponent],
  templateUrl: './monitoring-perspective.component.html',
  styleUrl: './monitoring-perspective.component.scss'
})
export class MonitoringPerspectiveComponent implements OnInit, OnDestroy {
  public workspaces: LogAnalyticsWorkspace[] = [];
  public activityEvents: ActivityLogEvent[] = [];
  public loading = false;
  public error: string | null = null;
  public filterQuery = '';
  public selectedActivityEvent: ActivityLogEvent | null = null;
  private readonly destroy$ = new Subject<void>();

  constructor(private monitoring: MonitoringService) {}

  public get filteredActivityEvents(): ActivityLogEvent[] {
    const terms = this.filterQuery.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return this.activityEvents;

    return this.activityEvents.filter((event) => {
      const searchable = JSON.stringify(event).toLocaleLowerCase();
      return terms.every((term) => searchable.includes(term));
    });
  }

  ngOnInit(): void {
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

  public operationName(event: ActivityLogEvent): string {
    return event.operationName?.localizedValue || event.operationName?.value || 'Unknown operation';
  }

  public statusName(event: ActivityLogEvent): string {
    return event.status?.localizedValue || event.status?.value || 'Unknown';
  }

  public openActivityDetails(event: ActivityLogEvent): void {
    this.selectedActivityEvent = event;
  }

  public onActivityRowKeydown(keyboardEvent: KeyboardEvent, event: ActivityLogEvent): void {
    if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
      keyboardEvent.preventDefault();
      this.openActivityDetails(event);
    }
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
