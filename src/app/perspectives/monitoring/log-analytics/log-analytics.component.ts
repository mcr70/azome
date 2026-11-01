import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LogAnalyticsWorkspace } from '@services/azure/monitoring.service';
import { ResourceTypeIconComponent } from '@components/resource-card/resource-type-icon.component';

/**
 * Read-only list of the Log Analytics workspaces found in the subscription.
 */
@Component({
  selector: 'app-log-analytics',
  standalone: true,
  imports: [CommonModule, ResourceTypeIconComponent],
  templateUrl: './log-analytics.component.html',
  styleUrl: './log-analytics.component.scss'
})
export class LogAnalyticsComponent {
  @Input() workspaces: LogAnalyticsWorkspace[] = [];
}
