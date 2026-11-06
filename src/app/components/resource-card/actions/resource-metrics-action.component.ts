import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Action button that navigates the user directly to the Monitoring perspective
 * for the specified Azure resource.
 */
@Component({
  selector: 'app-resource-metrics-action',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './resource-metrics-action.component.html',
  styleUrl: './resource-action-common.scss'
})
export class ResourceMetricsActionComponent {
  /** The ARM resource ID. */
  @Input({ required: true }) resourceId!: string;

  /** Display name of the resource for accessibility labelling. */
  @Input({ required: true }) resourceName!: string;

  /** Custom ARIA label fallback. */
  @Input() ariaLabel?: string;

  /**
   * Computes the accessibility label for the metrics action button.
   */
  get computedAriaLabel(): string {
    return this.ariaLabel ?? `View metrics for ${this.resourceName}`;
  }

  /**
   * Prevents the click event from bubbling up to the card container.
   */
  public onClick(event: MouseEvent): void {
    event.stopPropagation();
  }
}