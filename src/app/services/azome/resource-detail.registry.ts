import { Injectable, Type } from '@angular/core';
import { RouteTableDetailComponent } from '../../components/resource-details/route-table-detail.component';
import { NsgDetailComponent } from '../../components/resource-details/nsg-detail.component';


export type PanelVariant = 'default' | 'wide' | 'content';

export interface ResourceDetailItem {
  resource: any;
}

export type ResourceDetailComponentType = Type<ResourceDetailItem> & {
  preferredVariant?: PanelVariant; // The preferred layout variant for displaying the resource detail component.
};

@Injectable({
  providedIn: 'root'
})
export class ResourceDetailRegistryService {
  private registry = new Map<string, ResourceDetailComponentType>();

  constructor() {
    this.register('microsoft.network/routetables', RouteTableDetailComponent);
    this.register('microsoft.network/networksecuritygroups', NsgDetailComponent);
    // this.register('microsoft.network/virtualnetworks', VnetDetailComponent);
  }

  public register(resourceType: string, component: ResourceDetailComponentType): void {
    this.registry.set(resourceType.toLowerCase(), component);
  }

  public getComponent(resourceType: string): ResourceDetailComponentType | null {
    if (!resourceType) return null;
    return this.registry.get(resourceType.toLowerCase()) || null;
  }
}