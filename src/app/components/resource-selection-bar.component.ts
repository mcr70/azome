import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ResourceSelectionService } from '../services/azome/resource-selection.service';

@Component({
  selector: 'app-resource-selection-bar',
  standalone: true,
  imports: [CommonModule, A11yModule, OverlayModule],
  templateUrl: './resource-selection-bar.component.html',
  styleUrl: './resource-selection-bar.component.scss'
})
export class ResourceSelectionBarComponent {
  public isOpen = false;

  public readonly panelPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 }
  ];

  constructor(public selection: ResourceSelectionService) {
    this.selection.selectedResources$.pipe(takeUntilDestroyed()).subscribe((resources) => {
      if (resources.length === 0) {
        this.isOpen = false;
      }
    });
  }

  public removeResource(resourceId: string): void {
    this.selection.deselect(resourceId);
  }

  public onPanelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.isOpen = false;
    }
  }

  public clearSelection(): void {
    this.selection.clear();
  }

  public scrollToResource(resourceId: string): void {
    this.isOpen = false;
    const cardId = `resource-card-${encodeURIComponent(resourceId)}`;
    const card = document.getElementById(cardId)
      ?? document.querySelector<HTMLElement>(`[data-resource-id="${CSS.escape(resourceId)}"]`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
