import { Injectable, Type } from '@angular/core';
import { RouteTableDetailComponent } from '../../components/resource-details/route-table-detail.component';

export interface ResourceDetailItem {
  resource: any;
}

@Injectable({
  providedIn: 'root'
})
export class ResourceDetailRegistryService {
  private registry = new Map<string, Type<ResourceDetailItem>>();

  constructor() {
    this.register('microsoft.network/routetables', RouteTableDetailComponent);
    // this.register('microsoft.network/networksecuritygroups', NsgDetailComponent);
    // this.register('microsoft.network/virtualnetworks', VnetDetailComponent);
  }

  public register(resourceType: string, component: Type<ResourceDetailItem>): void {
    this.registry.set(resourceType.toLowerCase(), component);
  }

  public getComponent(resourceType: string): Type<ResourceDetailItem> | null {
    if (!resourceType) return null;
    return this.registry.get(resourceType.toLowerCase()) || null;
  }
}