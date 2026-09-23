import { Injectable, Type } from '@angular/core';
import { RouteTableComponent } from '../../components/resource-details/route-table.component';
import { NsgComponent } from '../../components/resource-details/nsg.component';
import { VnetComponent } from '../../components/resource-details/vnet.component';
import { StorageAccountComponent } from '../../components/resource-details/storage-account.component';


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
    this.register('microsoft.network/routetables', RouteTableComponent);
    this.register('microsoft.network/networksecuritygroups', NsgComponent);
    this.register('microsoft.network/virtualnetworks', VnetComponent);
    this.register('microsoft.storage/storageaccounts', StorageAccountComponent);
  }

  public register(resourceType: string, component: ResourceDetailComponentType): void {
    this.registry.set(resourceType.toLowerCase(), component);
  }

  public getComponent(resourceType: string): ResourceDetailComponentType | null {
    if (!resourceType) return null;
    return this.registry.get(resourceType.toLowerCase()) || null;
  }
}