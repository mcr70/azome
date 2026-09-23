import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PanelVariant, ResourceDetailItem } from '../../services/azome/resource-detail.registry';

export interface VNetSubnet {
  name: string;
  id?: string;
  properties?: {
    addressPrefix?: string;
    provisioningState?: string;
    networkSecurityGroup?: { id: string };
    routeTable?: { id: string };
    privateEndpointNetworkPolicies?: string;
    privateLinkServiceNetworkPolicies?: string;
  };
}

export interface VNetPeering {
  name: string;
  id?: string;
  properties?: {
    peeringState?: string;
    provisioningState?: string;
    allowVirtualNetworkAccess?: boolean;
    allowForwardedTraffic?: boolean;
    allowGatewayTransit?: boolean;
    useRemoteGateways?: boolean;
    remoteVirtualNetworkAddressSpace?: {
      addressPrefixes?: string[];
    };
    remoteVirtualNetwork?: { id: string };
  };
}

@Component({
  selector: 'app-vnet-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './vnet.component.html',
  styleUrl: './vnet.component.scss'
})
export class VnetComponent implements ResourceDetailItem {
  @Input() resource: any;
  static readonly preferredVariant: PanelVariant = 'wide';

  get addressPrefixes(): string[] {
    return this.resource?.properties?.addressSpace?.addressPrefixes || [];
  }

  get dnsServers(): string[] {
    return this.resource?.properties?.dhcpOptions?.dnsServers || [];
  }

  get subnets(): VNetSubnet[] {
    return this.resource?.properties?.subnets || [];
  }

  get peerings(): VNetPeering[] {
    return this.resource?.properties?.virtualNetworkPeerings || [];
  }

  // Apufunktio resurssin nimen erottamiseen täydestä Azure ID -polusta
  getResourceNameFromId(id?: string): string {
    if (!id) return '-';
    const parts = id.split('/');
    return parts[parts.length - 1] || id;
  }
}