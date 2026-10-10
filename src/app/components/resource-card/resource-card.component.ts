
import { AfterViewInit, Component, ElementRef, Input, ViewChild } from '@angular/core';
import { ResourceTypeIconComponent } from '../resource-type-icon.component';
import { ResourceSelectionService } from '../../services/azome/resource-selection.service';

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
export class ResourceCardComponent implements AfterViewInit {
  /** Azure resource type used to choose the card's leading icon. */
  @Input({ required: true }) type!: string;

  /** Main resource label displayed in the card header. */
  @Input({ required: true }) name!: string;

  /** ARM resource ID used when this card is selectable. */
  @Input() resourceId: string | null = null;

  /** Resource group associated with this resource. */
  @Input() resourceGroup: string | null | undefined = '';

  /** Shows a selection checkbox when true. */
  @Input() selectable = false;

  /** Pixel size of the leading resource type icon. Defaults to 24. */
  @Input() iconSize = 24;

  /** Shows the footer slot when true. Defaults to false. */
  @Input() hasFooter = false;

  /** Maximum card width as a CSS length. Use 'none' to fill the grid track. */
  @Input() maxWidth = '540px';

  @ViewChild('cardElement', { static: true }) private cardElement!: ElementRef<HTMLElement>;

  constructor(private selection: ResourceSelectionService) {}

  public get isSelected(): boolean {
    return this.resourceId ? this.selection.isSelected(this.resourceId) : false;
  }

  public ngAfterViewInit(): void {
    if (this.resourceId && this.selection.isFirstSelected(this.resourceId)) {
      this.cardElement.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  public onSelectionChange(event: Event): void {
    if (!this.resourceId) {
      return;
    }

    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      this.selection.select({
        id: this.resourceId,
        type: this.type,
        name: this.name,
        resourceGroup: this.resourceGroup ?? ''
      });
      return;
    }

    this.selection.deselect(this.resourceId);
  }
}
