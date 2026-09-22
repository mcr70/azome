import { NetworkTopology } from '../../services/azure/resource-graph.service';

export type NetworkGraphNodeKind = 'vnet' | 'subnet' | 'networkSecurityGroup' | 'routeTable';
export type NetworkGraphEdgeKind = 'contains' | 'secured-by' | 'routed-by' | 'peered-with';

export interface NetworkGraphNode {
  id: string;
  label: string;
  kind: NetworkGraphNodeKind;
  groupId: string;
  subnetNavigation?: SubnetNavigation;
}

export interface SubnetNavigation {
  subnetName: string;
  addressPrefixes: string[];
  networkSecurityGroupId: string | null;
  routeTableId: string | null;
}

export interface NetworkGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: NetworkGraphEdgeKind;
}

export interface NetworkGraph {
  nodes: NetworkGraphNode[];
  edges: NetworkGraphEdge[];
}

// Reshapes the resource-oriented topology list into a generic node/edge graph for rendering.
export function buildNetworkGraph(topologies: NetworkTopology[]): NetworkGraph {
  const nodes = new Map<string, NetworkGraphNode>();
  const edges = new Map<string, NetworkGraphEdge>();

  for (const topology of topologies) {
    nodes.set(topology.id, { id: topology.id, label: topology.name, kind: 'vnet', groupId: topology.id });

    for (const subnet of topology.subnets) {
      const subnetId = `${topology.id}/subnets/${subnet.name}`;
      nodes.set(subnetId, {
        id: subnetId,
        label: subnet.name,
        kind: 'subnet',
        groupId: topology.id,
        subnetNavigation: {
          subnetName: subnet.name,
          addressPrefixes: subnet.addressPrefixes,
          networkSecurityGroupId: subnet.networkSecurityGroupId,
          routeTableId: subnet.routeTableId
        }
      });
      addEdge(edges, `${subnetId}-contains`, topology.id, subnetId, 'contains');

      if (subnet.networkSecurityGroupId) {
        nodes.set(subnet.networkSecurityGroupId, {
          id: subnet.networkSecurityGroupId,
          label: subnet.networkSecurityGroupName ?? subnet.networkSecurityGroupId,
          kind: 'networkSecurityGroup',
          groupId: topology.id
        });
        addEdge(edges, `${subnetId}-nsg`, subnetId, subnet.networkSecurityGroupId, 'secured-by');
      }

      if (subnet.routeTableId) {
        nodes.set(subnet.routeTableId, {
          id: subnet.routeTableId,
          label: subnet.routeTableName ?? subnet.routeTableId,
          kind: 'routeTable',
          groupId: topology.id
        });
        addEdge(edges, `${subnetId}-route-table`, subnetId, subnet.routeTableId, 'routed-by');
      }
    }

    for (const peering of topology.peerings) {
      if (!peering.remoteVirtualNetworkId) {
        continue;
      }

      const peeringEdgeId = [topology.id, peering.remoteVirtualNetworkId].sort().join('<->');
      addEdge(edges, peeringEdgeId, topology.id, peering.remoteVirtualNetworkId, 'peered-with');
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values())
  };
}

function addEdge(
  edges: Map<string, NetworkGraphEdge>,
  id: string,
  source: string,
  target: string,
  kind: NetworkGraphEdgeKind
): void {
  edges.set(id, { id, source, target, kind });
}
