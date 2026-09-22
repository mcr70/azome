import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';


export interface AzureResource {
  id: string;
  name: string;
  type: string;
  location?: string;
  resourceGroup?: string;
}

interface ResourceGraphResponse {
  data: AzureNetworkResource[];
}

interface AzureNetworkResource {
  id: string;
  name: string;
  type: string;
  resourceGroup: string;
  location: string;
  properties: {
    addressSpace?: {
      addressPrefixes?: string[];
    };
    subnets?: AzureSubnet[];
    virtualNetworkPeerings?: AzurePeering[];
  };
}

interface AzurePeering {
  name: string;
  properties: {
    peeringState?: string;
    remoteVirtualNetwork?: {
      id: string;
    };
  };
}

interface AzureSecurityResource {
  id: string;
  name: string;
  type: string;
  properties: {
    securityRules?: AzureSecurityRule[];
    defaultSecurityRules?: AzureSecurityRule[];
    routes?: AzureRoute[];
  };
}

interface AzureSecurityRule {
  name: string;
  properties: {
    priority: number;
    direction: string;
    access: string;
    protocol: string;
    sourcePortRange?: string;
    destinationPortRange?: string;
    sourceAddressPrefix?: string;
    destinationAddressPrefix?: string;
  };
}

interface AzureRoute {
  name: string;
  properties: {
    addressPrefix?: string;
    nextHopType: string;
    nextHopIpAddress?: string;
  };
}

interface AzureSubnet {
  name: string;
  properties: {
    addressPrefix?: string;
    addressPrefixes?: string[];
    networkSecurityGroup?: {
      id: string;
    };
    routeTable?: {
      id: string;
    };
  };
}

export interface NetworkTopology {
  id: string;
  name: string;
  resourceGroup: string;
  location: string;
  addressPrefixes: string[];
  subnets: NetworkSubnet[];
  peerings: NetworkPeering[];
}

export interface NetworkPeering {
  name: string;
  remoteVirtualNetworkId: string | null;
  remoteVirtualNetworkName: string | null;
  peeringState: string | null;
}

export interface NetworkSubnet {
  name: string;
  addressPrefixes: string[];
  networkSecurityGroupId: string | null;
  networkSecurityGroupName: string | null;
  routeTableId: string | null;
  routeTableName: string | null;
}

export interface SecurityRule {
  name: string;
  priority: number;
  direction: string;
  access: string;
  protocol: string;
  sourcePortRange: string | null;
  destinationPortRange: string | null;
  sourceAddressPrefix: string | null;
  destinationAddressPrefix: string | null;
}

export interface RouteTableRoute {
  name: string;
  addressPrefix: string | null;
  nextHopType: string;
  nextHopIpAddress: string | null;
}

export interface SubnetRoutingDetail {
  networkSecurityGroupName: string | null;
  securityRules: SecurityRule[];
  defaultSecurityRules: SecurityRule[];
  routeTableName: string | null;
  routes: RouteTableRoute[];
}

@Injectable({ providedIn: 'root' })
export class ResourceGraphService {
  constructor(private http: HttpClient) {}

  public getNetworkTopologies(): Observable<NetworkTopology[]> {
    const url = `${environment.azure.resourceManagerUrl}/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01`;
    const query = "Resources | where type =~ 'microsoft.network/virtualnetworks' | project id, name, type, resourceGroup, location, properties";

    return this.http.post<ResourceGraphResponse>(url, {
      subscriptions: [environment.azure.subscriptionId],
      query,
      options: {
        resultFormat: 'objectArray'
      }
    }).pipe(
      map((response) => response.data.map((resource) => this.toTopology(resource)))
    );
  }


  public getResourcesByResourceGroup(resourceGroupName: string): Observable<AzureResource[]> {
    const url = `${environment.azure.resourceManagerUrl}/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01`;
    const query = `Resources | where resourceGroup =~ '${resourceGroupName}' | project id, name, type, location, resourceGroup | order by name asc`;

    return this.http.post<{ data: AzureResource[] }>(url, {
      subscriptions: [environment.azure.subscriptionId],
      query,
      options: {
        resultFormat: 'objectArray'
      }
    }).pipe(
      map((response) => response.data ?? [])
    );
  }


  private toTopology(resource: AzureNetworkResource): NetworkTopology {
    return {
      id: resource.id,
      name: resource.name,
      resourceGroup: resource.resourceGroup,
      location: resource.location,
      addressPrefixes: resource.properties.addressSpace?.addressPrefixes ?? [],
      subnets: (resource.properties.subnets ?? []).map((subnet) => ({
        name: subnet.name,
        addressPrefixes: subnet.properties.addressPrefixes ?? this.toArray(subnet.properties.addressPrefix),
        networkSecurityGroupId: subnet.properties.networkSecurityGroup?.id ?? null,
        networkSecurityGroupName: this.resourceName(subnet.properties.networkSecurityGroup?.id),
        routeTableId: subnet.properties.routeTable?.id ?? null,
        routeTableName: this.resourceName(subnet.properties.routeTable?.id)
      })),
      peerings: (resource.properties.virtualNetworkPeerings ?? []).map((peering) => ({
        name: peering.name,
        remoteVirtualNetworkId: peering.properties.remoteVirtualNetwork?.id ?? null,
        remoteVirtualNetworkName: this.resourceName(peering.properties.remoteVirtualNetwork?.id),
        peeringState: peering.properties.peeringState ?? null
      }))
    };
  }

  private toArray(value: string | undefined): string[] {
    return value ? [value] : [];
  }

  private resourceName(resourceId: string | undefined): string | null {
    return resourceId ? resourceId.split('/').pop() ?? null : null;
  }

  public getSubnetRoutingDetail(
    networkSecurityGroupId: string | null,
    routeTableId: string | null
  ): Observable<SubnetRoutingDetail> {
    const empty: SubnetRoutingDetail = {
      networkSecurityGroupName: null,
      securityRules: [],
      defaultSecurityRules: [],
      routeTableName: null,
      routes: []
    };

    if (!networkSecurityGroupId && !routeTableId) {
      return of(empty);
    }

    const filters = [networkSecurityGroupId, routeTableId]
      .filter((id): id is string => !!id)
      .map((id) => `id =~ '${id}'`)
      .join(' or ');

    const url = `${environment.azure.resourceManagerUrl}/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01`;
    const query = `Resources | where ${filters} | project id, name, type, properties`;

    return this.http.post<{ data: AzureSecurityResource[] }>(url, {
      subscriptions: [environment.azure.subscriptionId],
      query,
      options: {
        resultFormat: 'objectArray'
      }
    }).pipe(
      map((response) => this.toSubnetRoutingDetail(response.data, empty))
    );
  }

  private toSubnetRoutingDetail(resources: AzureSecurityResource[], empty: SubnetRoutingDetail): SubnetRoutingDetail {
    const nsg = resources.find((resource) => resource.type.toLowerCase() === 'microsoft.network/networksecuritygroups');
    const routeTable = resources.find((resource) => resource.type.toLowerCase() === 'microsoft.network/routetables');

    return {
      networkSecurityGroupName: nsg?.name ?? empty.networkSecurityGroupName,
      securityRules: (nsg?.properties.securityRules ?? []).map((rule) => this.toSecurityRule(rule)),
      defaultSecurityRules: (nsg?.properties.defaultSecurityRules ?? []).map((rule) => this.toSecurityRule(rule)),
      routeTableName: routeTable?.name ?? empty.routeTableName,
      routes: (routeTable?.properties.routes ?? []).map((route) => ({
        name: route.name,
        addressPrefix: route.properties.addressPrefix ?? null,
        nextHopType: route.properties.nextHopType,
        nextHopIpAddress: route.properties.nextHopIpAddress ?? null
      }))
    };
  }

  private toSecurityRule(rule: AzureSecurityRule): SecurityRule {
    return {
      name: rule.name,
      priority: rule.properties.priority,
      direction: rule.properties.direction,
      access: rule.properties.access,
      protocol: rule.properties.protocol,
      sourcePortRange: rule.properties.sourcePortRange ?? null,
      destinationPortRange: rule.properties.destinationPortRange ?? null,
      sourceAddressPrefix: rule.properties.sourceAddressPrefix ?? null,
      destinationAddressPrefix: rule.properties.destinationAddressPrefix ?? null
    };
  }
}
