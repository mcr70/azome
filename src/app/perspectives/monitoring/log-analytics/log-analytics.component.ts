import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LogAnalyticsWorkspace } from '@services/azure/monitoring.service';
import { ResourceTypeIconComponent } from '@components/resource-type-icon.component';

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
