import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PanelVariant, ResourceDetailItem } from '../../services/azome/resource-detail.registry';

export interface CosmosDbLocation {
  id?: string;
  locationName?: string;
  failoverPriority?: number;
  documentEndpoint?: string;
  isZoneRedundant?: boolean;
  provisioningState?: string;
}

export interface CosmosDbProperties {
  provisioningState?: string;
  publicNetworkAccess?: string;
  documentEndpoint?: string;
  sqlEndpoint?: string;
  EnabledApiTypes?: string;
  databaseAccountOfferType?: string;
  defaultConsistencyLevel?: string;
  consistencyPolicy?: {
    defaultConsistencyLevel?: string;
    maxIntervalInSeconds?: number;
    maxStalenessPrefix?: number;
  };
  enableFreeTier?: boolean;
  enableAutomaticFailover?: boolean;
  enableMultipleWriteLocations?: boolean;
  disableLocalAuth?: boolean;
  minimalTlsVersion?: string;
  backupPolicy?: {
    type?: string;
    periodicModeProperties?: {
      backupRetentionIntervalInHours?: number;
      backupIntervalInMinutes?: number;
      backupStorageRedundancy?: string;
    };
  };
  locations?: CosmosDbLocation[];
  writeLocations?: CosmosDbLocation[];
  readLocations?: CosmosDbLocation[];
}

@Component({
  selector: 'app-cosmos-db-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cosmosdb.component.html',
  styleUrl: './cosmosdb.component.scss'
})
export class CosmosDbComponent implements ResourceDetailItem {
  @Input() resource: any;
  static readonly preferredVariant: PanelVariant = 'content';

  get properties(): CosmosDbProperties | undefined {
    return this.resource?.properties || this.resource;
  }
}