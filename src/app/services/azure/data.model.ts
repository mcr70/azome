import { AzureResource } from './resource-graph.service';

// --- Storage Account Properties ---
export interface StorageAccountProperties {
  primaryEndpoints?: {
    blob?: string;
    file?: string;
    queue?: string;
    table?: string;
    web?: string;
  };
  allowSharedKeyAccess?: boolean;
  allowBlobPublicAccess?: boolean;
  supportsHttpsTrafficOnly?: boolean;
  minimumTlsVersion?: string;
  publicNetworkAccess?: 'Enabled' | 'Disabled' | string;
  networkAcls?: {
    defaultAction: 'Allow' | 'Deny';
    ipRules?: Array<{ value: string; action: string }>;
    virtualNetworkRules?: Array<{ id: string; action: string }>;
  };
  privateEndpointConnections?: Array<{
    id: string;
    name: string;
    properties?: {
      privateLinkServiceConnectionState?: {
        status: string;
      };
    };
  }>;
}

// --- Azure SQL Database / Server Properties ---
export interface SqlDatabaseProperties {
  administratorLogin?: string;
  publicNetworkAccess?: 'Enabled' | 'Disabled' | string;
  state?: string;
  maxSizeBytes?: number;
  collation?: string;
}

// --- Cosmos DB Properties ---
export interface CosmosDbProperties {
  documentEndpoint?: string;
  publicNetworkAccess?: 'Enabled' | 'Disabled' | string;
  databaseAccountOfferType?: string;
  enableAutomaticFailover?: boolean;
  enableMultipleWriteLocations?: boolean;
}

// --- Key Vault Properties ---
export interface KeyVaultProperties {
  vaultUri?: string;
  sku?: {
    family: string;
    name: 'standard' | 'premium' | string;
  };
  enableSoftDelete?: boolean;
  enablePurgeProtection?: boolean;
  publicNetworkAccess?: 'Enabled' | 'Disabled' | string;
}

// --- Yhdistetty Data-resurssin päärajapinta ---
export interface AzureStorageAccountResource extends AzureResource {
  type: 'microsoft.storage/storageaccounts' | string;
  properties: StorageAccountProperties;
}

export interface AzureSqlDatabaseResource extends AzureResource {
  type: 'microsoft.sql/servers/databases' | 'microsoft.sql/servers' | string;
  properties: SqlDatabaseProperties;
}

export interface AzureCosmosDbResource extends AzureResource {
  type: 'microsoft.documentdb/databaseaccounts' | string;
  properties: CosmosDbProperties;
}

export interface AzureKeyVaultResource extends AzureResource {
  type: 'microsoft.keyvault/vaults' | string;
  properties: KeyVaultProperties;
}

// Pääunioni: Tämän avulla Angular-komponentti käsittelee mitä tahansa Data-resurssia
export type AzureDataResource = 
  | AzureStorageAccountResource 
  | AzureSqlDatabaseResource 
  | AzureCosmosDbResource 
  | AzureKeyVaultResource;