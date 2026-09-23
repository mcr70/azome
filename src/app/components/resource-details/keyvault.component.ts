import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PanelVariant, ResourceDetailItem } from '../../services/azome/resource-detail.registry';

export interface KeyVaultProperties {
  provisioningState?: string;
  publicNetworkAccess?: string;
  tenantId?: string;
  enabledForTemplateDeployment?: boolean;
  enableRbacAuthorization?: boolean;
  softDeleteRetentionInDays?: number;
  enabledForDiskEncryption?: boolean;
  enabledForDeployment?: boolean;
  sku?: {
    name: string;
    family: string;
  };
  enableSoftDelete?: boolean;
  accessPolicies?: any[];
  vaultUri?: string;
}

@Component({
  selector: 'app-key-vault-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './keyvault.component.html',
  styleUrl: './keyvault.component.scss'
})
export class KeyVaultComponent implements ResourceDetailItem {
  @Input() resource: any;
  static readonly preferredVariant: PanelVariant = 'content';

  get properties(): KeyVaultProperties | undefined {
    return this.resource?.properties || this.resource;
  }
}