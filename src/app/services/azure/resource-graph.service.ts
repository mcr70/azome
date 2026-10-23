import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { EMPTY, Observable, of } from 'rxjs';
import { expand, map, reduce } from 'rxjs/operators';
import { environment } from '@environments/environment';
import { AzureDataResource } from './data.model';

export type AppResourceCategory =
  | 'Serverless'
  | 'Containers'
  | 'Web'
  | 'Compute'
  | 'Integration'
  | 'Other';

export interface AzureAppResource extends AzureResource {
  kind?: string;
  category: AppResourceCategory;
  subscriptionId?: string;
  tags?: Record<string, string>;
  properties?: Record<string, unknown>;
}

export interface AzureTaggedAppResource extends AzureResource {
  kind?: string;
  tags: Record<string, string>;
}

export interface AzureResource {
  id: string;
  name: string;
  type: string;
  location?: string;
  resourceGroup?: string;
}

/** Describes the SKU metadata returned for Azure resources. */
export interface AzureResourceSku {
  name?: string;
  tier?: string;
  capacity?: number;
}

export interface AzureResourceDetail extends AzureResource {
  kind?: string;
  tags?: { [key: string]: string };
  properties?: any;
  sku?: AzureResourceSku;
}

interface ResourceGraphResponse {
  data: AzureNetworkResource[];
}

export interface ResourceGraphQueryResult {
  columns: { name: string; type: string }[];
  rows: Record<string, unknown>[];
  totalRecords: number;
  resultTruncated: 'true' | 'false';
  $skipToken?: string;
}

interface ResourceGraphTableResponse {
  data: {
    columns: ResourceGraphQueryResult['columns'];
    rows: unknown[][];
  };
  totalRecords: number;
  resultTruncated: 'true' | 'false';
  $skipToken?: string;
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

export interface AzureSubnet {
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
  networkSecurityGroupName?: string | null;
  routeTableId: string | null;
  routeTableName?: string | null;
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

  /**
   * Get all network topologies in the Azure subscription.
   * 
   * @returns An observable that emits an array of network topologies.
   */
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

  public executeQuery(query: string): Observable<ResourceGraphQueryResult> {
    const url = `${environment.azure.resourceManagerUrl}/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01`;

    return this.http.post<ResourceGraphTableResponse>(url, {
      subscriptions: [environment.azure.subscriptionId],
      query,
      options: {
        resultFormat: 'table'
      }
    }).pipe(
      map((response) => ({
        columns: response.data.columns,
        rows: response.data.rows.map((values) => Object.fromEntries(
          response.data.columns.map((column, index) => [column.name, values[index]])
        )),
        totalRecords: response.totalRecords,
        resultTruncated: response.resultTruncated,
        $skipToken: response.$skipToken
      }))
    );
  }

  /**
   * Get all Azure resources within a specific resource group.
   * 
   * @param resourceGroupName The name of the resource group.
   * @returns An observable that emits an array of Azure resources within the specified resource group.
   */
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


  public getDataResources(): Observable<AzureDataResource[]> {
    const url = `${environment.azure.resourceManagerUrl}/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01`;

    const query = `
      resources
      | where type in~ (
          'microsoft.storage/storageaccounts',
          'microsoft.documentdb/databaseaccounts',
          'microsoft.dbforpostgresql/flexibleservers',
          'microsoft.dbformysql/flexibleservers',
          'microsoft.sql/servers',
          'microsoft.sql/servers/databases',
          'microsoft.cache/redis',
          'microsoft.servicebus/namespaces',
          'microsoft.eventhub/namespaces'
      )
      | project id, name, type, location, resourceGroup, subscriptionId, tags, properties
      | extend category = case(
          type startswith 'microsoft.storage', 'Storage',
          type startswith 'microsoft.documentdb', 'NoSQL',
          type in~ (
              'microsoft.dbforpostgresql/flexibleservers',
              'microsoft.dbformysql/flexibleservers',
              'microsoft.sql/servers/databases'
          ), 'Relational',
          type in~ (
              'microsoft.servicebus/namespaces',
              'microsoft.eventhub/namespaces'
          ), 'Messaging',
          type startswith 'microsoft.cache', 'Cache',
          'Other'
      )
      | order by category asc, name asc
    `;

    return this.http.post<{ data: AzureDataResource[] }>(url, {
      subscriptions: [environment.azure.subscriptionId],
      query,
      options: { resultFormat: 'objectArray' }
    }).pipe(
      map((response) => response.data ?? [])
    );
  }

  public getApplicationResources(): Observable<AzureAppResource[]> {
    const url = `${environment.azure.resourceManagerUrl}/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01`;

    const query = `
      resources
      | where type in~ (
          'microsoft.web/sites',
          'microsoft.web/serverfarms',
          'microsoft.app/containerapps',
          'microsoft.app/managedenvironments',
          'microsoft.logic/workflows',
          'microsoft.containerinstance/containergroups'
      )
      | project id, name, type, location, resourceGroup, kind, subscriptionId, tags, properties
      | extend category = case(
          type =~ 'microsoft.app/containerapps', 'Containers',
          type =~ 'microsoft.app/managedenvironments', 'Containers',
          type =~ 'microsoft.web/sites' and isnotempty(kind) and kind has 'functionapp', 'Serverless',
          type =~ 'microsoft.web/sites', 'Web',
          type =~ 'microsoft.web/serverfarms', 'Compute',
          type =~ 'microsoft.logic/workflows', 'Integration',
          'Other'
      )
      | order by category asc, name asc
    `;

    return this.http.post<{ data: AzureAppResource[] }>(url, {
      subscriptions: [environment.azure.subscriptionId],
      query,
      options: { resultFormat: 'objectArray' }
    }).pipe(
      map((response) => response.data ?? [])
    );
  }

  public getTaggedApplicationResources(): Observable<AzureTaggedAppResource[]> {
    const url = `${environment.azure.resourceManagerUrl}/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01`;
    const query = `
      Resources
      | where isnotempty(tags['azome-apps'])
      | project id, name, type, location, resourceGroup, kind, tags
      | order by name asc, id asc
    `;
    interface TaggedResourceResponse {
      data: AzureTaggedAppResource[];
      $skipToken?: string;
    }

    const fetchPage = (skipToken?: string): Observable<TaggedResourceResponse> => {
      return this.http.post<TaggedResourceResponse>(url, {
        subscriptions: [environment.azure.subscriptionId],
        query,
        options: {
          resultFormat: 'objectArray',
          $top: 1000,
          ...(skipToken ? { $skipToken: skipToken } : {})
        }
      });
    };

    return fetchPage().pipe(
      expand((response) => response.$skipToken ? fetchPage(response.$skipToken) : EMPTY),
      reduce<TaggedResourceResponse, AzureTaggedAppResource[]>(
        (resources, response) => resources.concat(response.data), []
      )
    );
  }


  /**
   * Get the details of a specific Azure resource by its ID.
   * 
   * @param resourceId The ID of the Azure resource.
   * @returns An observable that emits the details of the Azure resource, or null if not found.
   */
  public getResourceDetails(resourceId: string): Observable<AzureResourceDetail | null> {
    const url = `${environment.azure.resourceManagerUrl}/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01`;
    const query = `Resources | where id =~ '${resourceId}' | project id, name, type, location, resourceGroup, kind, tags, properties, sku`;

    return this.http.post<{ data: AzureResourceDetail[] }>(url, {
      subscriptions: [environment.azure.subscriptionId],
      query,
      options: {
        resultFormat: 'objectArray'
      }
    }).pipe(
      map((response) => (response.data && response.data.length > 0) ? response.data[0] : null)
    );
  }


  /**
   * Get the routing details of a subnet, including its associated network security group and route table.
   * 
   * @param networkSecurityGroupId The ID of the network security group associated with the subnet.
   * @param routeTableId The ID of the route table associated with the subnet.
   * @returns An observable that emits the routing details of the subnet, including security rules and routes.
   */
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
