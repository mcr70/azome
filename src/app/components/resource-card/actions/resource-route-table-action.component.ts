import { Component, Input, EventEmitter, Output } from '@angular/core';
import { ResourceTypeIconComponent } from '@components/resource-card/resource-type-icon.component';

/**
 * Action button / chip that displays a Route Table and opens its details pane.
 */
@Component({
  selector: 'app-resource-route-table-action',
  standalone: true,
  imports: [ResourceTypeIconComponent],
  template: `
    <button
      type="button"
      class="control-btn resource-action"
      [class.unassigned]="!routeTableName"
      [disabled]="!routeTableId"
      [attr.aria-label]="'Show details for Route Table ' + (routeTableName || 'Unassigned')"
      [title]="routeTableName ? 'View Route Table: ' + routeTableName : 'No route table assigned'"
      (click)="onClick($event)">
      <app-resource-type-icon
        type="Microsoft.Network/routeTables"
        [size]="16">
      </app-resource-type-icon>
      {{ routeTableName || 'No route table' }}
    </button>
  `,
  styleUrls: ['./resource-action-common.scss']
})
export class ResourceRouteTableActionComponent {
  /** The ARM resource ID of the route table. */
  @Input() routeTableId!: string | null | undefined;

  /** Display name of the route table. */
  @Input() routeTableName!: string | null | undefined;

  /** Emitted when the route table button is clicked. */
  @Output() routeTableClick = new EventEmitter<{ resourceId: string; event: MouseEvent }>();

  public onClick(event: MouseEvent): void {
    event.stopPropagation();
    if (this.routeTableId) {
      this.routeTableClick.emit({ resourceId: this.routeTableId, event });
    }
  }
}