import { Component, Input, OnChanges, SimpleChanges, Type } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PanelVariant, ResourceDetailItem, ResourceDetailRegistryService } from '../../services/azome/resource-detail.registry';
import { DefaultResourceDetailComponent } from './default-resource-detail.component';

@Component({
  selector: 'app-resource-detail-host',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './resource-detail-host.component.html',
  styleUrls: ['./resource-detail-host.component.scss']
})
export class ResourceDetailHostComponent implements OnChanges {
  @Input() resource: any;

  public activeTab: 'overview' | 'json' = 'overview';
  public currentComponent: Type<ResourceDetailItem> = DefaultResourceDetailComponent;
  public componentInputs: { [key: string]: any } = {};
  public hasCustomComponent: boolean = false;

  constructor(private registryService: ResourceDetailRegistryService) {
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['resource'] && this.resource) {
      const targetComponent = this.registryService.getComponent(this.resource.type);

      this.hasCustomComponent = !!targetComponent;
      this.currentComponent = targetComponent || DefaultResourceDetailComponent;
      this.componentInputs = { resource: this.resource };

      this.activeTab = 'overview';   
    }
  }

  public setTab(tab: 'overview' | 'json'): void {
    this.activeTab = tab;
  }
}