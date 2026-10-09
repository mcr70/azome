import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AzureResourceDetail } from '@services/azure/resource-graph.service';
import {
  ResourceDetailComponentType,
  ResourceDetailRegistryService
} from '@services/azome/resource-detail.registry';
import { DetailsPanelComponent } from '@components/details-panel/details-panel.component';

@Component({
  selector: 'app-data-browse-pane',
  standalone: true,
  imports: [CommonModule, DetailsPanelComponent],
  template: `
    <app-details-panel
      [isOpen]="true"
      [title]="resource.name"
      [subtitle]="'Browse data'"
      [variant]="variant"
      [showPanelActions]="false"
      (close)="close.emit()">
      <ng-container
        *ngComponentOutlet="browserComponent; inputs: { resource: resource, view: 'browse' }">
      </ng-container>
    </app-details-panel>
  `,
  styles: [
    ':host { display: block; min-width: 0; }'
  ]
})
export class DataBrowsePaneComponent {
  @Input({ required: true }) resource!: AzureResourceDetail;
  @Output() close = new EventEmitter<void>();

  constructor(private readonly registry: ResourceDetailRegistryService) {}

  public get browserComponent(): ResourceDetailComponentType | null {
    return this.registry.getComponent(this.resource.type);
  }

  public get variant(): 'default' | 'wide' | 'content' {
    return this.browserComponent?.preferredVariant || 'wide';
  }
}
