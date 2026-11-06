import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Action button that triggers opening the resource details side pane.
 */
@Component({
  selector: 'app-resource-details-action',
  standalone: true,
  imports: [],
  template: `
    <button
      type="button"
      class="resource-action details-action"
      [attr.aria-label]="'Show details for ' + resourceName"
      title="Resource details"
      (click)="onClick($event)">
      <span aria-hidden="true">i</span>
    </button>
  `
})
export class ResourceDetailsActionComponent {
  /** The ARM resource ID. */
  @Input({ required: true }) resourceId!: string;

  /** Resource name for accessibility labelling. */
  @Input({ required: true }) resourceName!: string;

  /** Emitted when the details icon is clicked. */
  @Output() detailsClick = new EventEmitter<{ resourceId: string; event: MouseEvent }>();

  public onClick(event: MouseEvent): void {
    event.stopPropagation();
    this.detailsClick.emit({ resourceId: this.resourceId, event });
  }
}