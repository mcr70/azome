import { Component, Input, EventEmitter, Output } from '@angular/core';
import { ResourceTypeIconComponent } from '@components/resource-card/resource-type-icon.component';

/**
 * Action button / chip that displays a Subnet and opens its details pane.
 */
@Component({
  selector: 'app-resource-subnet-action',
  standalone: true,
  imports: [ResourceTypeIconComponent],
  template: `
    <button
      type="button"
      class="control-btn resource-action"
      [attr.aria-label]="'Show details for Subnet ' + subnetName"
      [title]="'View Subnet: ' + subnetName"
      (click)="onClick($event)">
      <app-resource-type-icon
        type="Microsoft.Network/virtualNetworks/subnets"
        [size]="16">
      </app-resource-type-icon>
      {{ subnetName }}
    </button>
  `,
  styleUrls: ['./resource-action-common.scss']
})
export class ResourceSubnetActionComponent {
  /** The ARM resource ID of the subnet. */
  @Input({ required: true }) subnetId!: string;

  /** Display name of the subnet. */
  @Input({ required: true }) subnetName!: string;

  /** Emitted when the subnet button is clicked. */
  @Output() subnetClick = new EventEmitter<{ resourceId: string; event: MouseEvent }>();

  public onClick(event: MouseEvent): void {
    event.stopPropagation();
    this.subnetClick.emit({ resourceId: this.subnetId, event });
  }
}