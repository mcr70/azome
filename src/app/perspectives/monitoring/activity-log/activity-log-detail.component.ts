import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityLogEvent } from '@services/azure/monitoring.service';
import { DetailsPanelComponent } from '@components/details-panel/details-panel.component';

/**
 * Detail panel for a single activity log event with formatted and JSON views.
 */
@Component({
  selector: 'app-activity-log-detail',
  standalone: true,
  imports: [CommonModule, DetailsPanelComponent],
  templateUrl: './activity-log-detail.component.html',
  styleUrl: './activity-log-detail.component.scss'
})
export class ActivityLogDetailComponent {
  @Input({ required: true }) event!: ActivityLogEvent;
  @Output() close = new EventEmitter<void>();

  public view: 'formatted' | 'json' = 'formatted';

  /** Human-readable operation name of the event. */
  public get operation(): string {
    return this.event.operationName?.localizedValue || this.event.operationName?.value || 'Unknown operation';
  }

  /** Human-readable status of the event. */
  public get status(): string {
    return this.event.status?.localizedValue || this.event.status?.value || 'Unknown';
  }
}
