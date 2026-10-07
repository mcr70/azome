
import { Component, Input } from '@angular/core';
import { ResourceTypeIconComponent } from './resource-type-icon.component';

/**
 * Shared visual shell for resource cards across perspectives.
 *
 * Content is supplied through the card-title-prefix, card-header-trailing,
 * card-actions, card-metadata, and card-footer projection slots. Add the
 * resource-action class to buttons projected into card-actions. The component
 * has no outputs because perspective-specific actions are projected as controls.
 */
@Component({
  selector: 'app-resource-card',
  standalone: true,
  imports: [ResourceTypeIconComponent],
  templateUrl: './resource-card.component.html',
  styleUrl: './resource-card.component.scss'
})
export class ResourceCardComponent {
  /** Azure resource type used to choose the card's leading icon. */
  @Input({ required: true }) type!: string;

  /** Main resource label displayed in the card header. */
  @Input({ required: true }) name!: string;

  /** Pixel size of the leading resource type icon. Defaults to 24. */
  @Input() iconSize = 24;

  /** Shows the footer slot when true. Defaults to false. */
  @Input() hasFooter = false;

  /** Maximum card width as a CSS length. Use 'none' to fill the grid track. */
  @Input() maxWidth = '540px';
}
