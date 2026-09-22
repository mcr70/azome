import { Component, Input, OnChanges, SimpleChanges, Type } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResourceDetailItem, ResourceDetailRegistryService } from '../../services/azome/resource-detail.registry';
import { DefaultResourceDetailComponent } from './default-resource-detail.component';

@Component({
  selector: 'app-resource-detail-host',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container *ngComponentOutlet="currentComponent; inputs: componentInputs"></ng-container>
  `
})
export class ResourceDetailHostComponent implements OnChanges {
  @Input() resource: any;

  public currentComponent: Type<ResourceDetailItem> = DefaultResourceDetailComponent;
  public componentInputs: { [key: string]: any } = {};

  constructor(private registryService: ResourceDetailRegistryService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['resource'] && this.resource) {
      const targetComponent = this.registryService.getComponent(this.resource.type);
      
      this.currentComponent = targetComponent || DefaultResourceDetailComponent;
      
      this.componentInputs = { resource: this.resource };
    }
  }
}