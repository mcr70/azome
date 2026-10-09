import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { StorageAccountBrowserComponent } from './browser/storage-account-browser.component';
import { PanelVariant, ResourceDetailItem } from '@services/azome/resource-detail.registry';

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
  imports: [CommonModule, StorageAccountBrowserComponent],
  templateUrl: './storage-account-details.component.html',
  styleUrl: './storage-account-details.component.scss'
})
export class StorageAccountComponent implements ResourceDetailItem {
  @Input() resource: any;
  @Input() view: 'overview' | 'browse' = 'overview';

  static readonly preferredVariant: PanelVariant = 'wide';

  private get props(): any {
    return this.resource?.properties || this.resource || {};
  }

  get resourceId(): string {
    return this.resource?.id || '';
  }

  get provisioningState(): string {
    return this.props.provisioningState || 'Succeeded';
  }

  get tags(): Array<{ name: string; value: string }> {
    return Object.entries(this.resource?.tags ?? {}).map(([name, value]) => ({
      name,
      value: String(value)
    }));
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
    const endpoints = this.props.primaryEndpoints;
    if (!endpoints) {
      return [];
    }
    return Object.entries(endpoints).map(([type, url]) => ({
      type: type.toUpperCase(),
      url: url as string
    }));
  }

  get encryptionServices(): EncryptionServiceItem[] {
    const services = this.props.encryption?.services;
    if (!services) {
      return [];
    }
    return Object.entries(services).map(([name, config]: [string, any]) => ({
      name: name.toUpperCase(),
      enabled: config.enabled ?? false,
      keyType: config.keyType,
      lastEnabledTime: config.lastEnabledTime
    }));
  }
}
