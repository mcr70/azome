import { Component, Input, EventEmitter, Output } from '@angular/core';
import { ResourceTypeIconComponent } from '@components/resource-card/resource-type-icon.component';

/**
 * Action button / chip that displays an NSG and opens its details pane.
 */
@Component({
  selector: 'app-resource-nsg-action',
  standalone: true,
  imports: [ResourceTypeIconComponent],
  templateUrl: './resource-nsg-action.component.html',
  styleUrls: ['./resource-action-common.scss']
})
export class ResourceNsgActionComponent {
  @Input({ required: true }) nsgId!: string;
  @Input({ required: true }) nsgName!: string;

  @Output() nsgClick = new EventEmitter<{ resourceId: string; event: MouseEvent }>();

  public onClick(event: MouseEvent): void {
    event.stopPropagation();
    this.nsgClick.emit({ resourceId: this.nsgId, event });
  }
}