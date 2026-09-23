import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PanelVariant, ResourceDetailItem } from '../../services/azome/resource-detail.registry';

export interface EndpointItem {
  type: string;
  url: string;
}

export interface EncryptionServiceItem {
  name: string;
  enabled: boolean;
  keyType?: string;
  lastEnabledTime?: string;
}

@Component({
  selector: 'app-storage-account-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './storage-account.component.html',
  styleUrl: './storage-account.component.scss'
})
export class StorageAccountComponent implements ResourceDetailItem {
  @Input() resource: any;
  static readonly preferredVariant: PanelVariant = 'wide';

  // Azure JSON voi olla joko suoraan tässä tai .properties-kentässä
  private get props(): any {
    return this.resource?.properties || this.resource || {};
  }

  get provisioningState(): string {
    return this.props.provisioningState || 'Succeeded';
  }

  get statusOfPrimary(): string {
    return this.props.statusOfPrimary || 'available';
  }

  get location(): string {
    return this.props.primaryLocation || this.resource?.location || '-';
  }

  get accessTier(): string {
    return this.props.accessTier || '-';
  }

  get minimumTlsVersion(): string {
    return this.props.minimumTlsVersion || 'TLS1_2';
  }

  get creationTime(): string | null {
    return this.props.creationTime || null;
  }

  get supportsHttpsTrafficOnly(): boolean {
    return this.props.supportsHttpsTrafficOnly ?? true;
  }

  get publicNetworkAccess(): string {
    return this.props.publicNetworkAccess || 'Enabled';
  }

  get allowBlobPublicAccess(): boolean {
    return this.props.allowBlobPublicAccess ?? false;
  }

  get allowSharedKeyAccess(): boolean {
    return this.props.allowSharedKeyAccess ?? true;
  }

  get isHnsEnabled(): boolean {
    return this.props.isHnsEnabled ?? false;
  }

  get defaultNetworkAction(): string {
    return this.props.networkAcls?.defaultAction || 'Allow';
  }

  get keySource(): string {
    return this.props.encryption?.keySource || 'Microsoft.Storage';
  }

  get endpoints(): EndpointItem[] {
    const ep = this.props.primaryEndpoints;
    if (!ep) return [];
    return Object.entries(ep).map(([type, url]) => ({
      type: type.toUpperCase(),
      url: url as string
    }));
  }

  get encryptionServices(): EncryptionServiceItem[] {
    const services = this.props.encryption?.services;
    if (!services) return [];
    return Object.entries(services).map(([name, config]: [string, any]) => ({
      name: name.toUpperCase(),
      enabled: config.enabled ?? false,
      keyType: config.keyType,
      lastEnabledTime: config.lastEnabledTime
    }));
  }
}