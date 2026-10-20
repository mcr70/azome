import { Component, Input } from '@angular/core';
import {
  ResourceSelectionService,
  SelectedAzureResource
} from '@services/azome/resource-selection.service';

type GridResource = Omit<SelectedAzureResource, 'resourceGroup'> & {
  resourceGroup?: string;
};

@Component({
  selector: 'app-resource-grid-selection',
  standalone: true,
  templateUrl: './resource-grid-selection.component.html',
  styleUrl: './resource-grid-selection.component.scss'
})
export class ResourceGridSelectionComponent {
  @Input({ required: true }) resources: readonly GridResource[] = [];

  @Input() resourceGroup = '';

  @Input({ required: true }) label = '';

  constructor(private readonly selection: ResourceSelectionService) {}

  public get allSelected(): boolean {
    return this.resources.length > 0
      && this.resources.every((resource) => this.selection.isSelected(resource.id));
  }

  public get partiallySelected(): boolean {
    return !this.allSelected
      && this.resources.some((resource) => this.selection.isSelected(resource.id));
  }

  public toggleSelection(): void {
    this.selection.toggleResources(this.resources.map((resource) => ({
      ...resource,
      resourceGroup: resource.resourceGroup ?? this.resourceGroup
    })));
  }
}
