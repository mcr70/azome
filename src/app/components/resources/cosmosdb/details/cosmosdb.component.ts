import { Component, Input, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PanelVariant, ResourceDetailItem } from '../../../../services/azome/resource-detail.registry';
import { CosmosDbService, CosmosResource } from '../../../../services/azure/cosmosdb.service';

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
  imports: [CommonModule, FormsModule],
  templateUrl: './cosmosdb.component.html',
  styleUrl: './cosmosdb.component.scss'
})
export class CosmosDbComponent implements ResourceDetailItem, OnInit {
  @Input() resource: any;
  @Input() view: 'overview' | 'browse' = 'overview';
  static readonly preferredVariant: PanelVariant = 'content';

  databases: CosmosResource<unknown>[] = [];
  containers: CosmosResource<unknown>[] = [];
  documents: CosmosResource<unknown>[] = [];
  database = '';
  container = '';
  searchMode: 'all' | 'partition' | 'id' = 'all';
  searchValue = '';
  resultLimit = 50;
  loading = false;
  error = '';

  constructor(private readonly cosmos: CosmosDbService) {}

  ngOnInit(): void {
    if (this.view !== 'browse') {
      return;
    }

    const account = this.accountName;
    if (!account) {
      this.error = 'Could not determine the Cosmos DB account name.';
      return;
    }

    this.loading = true;
    this.cosmos.listDatabases(account).subscribe({
      next: (databases) => {
        this.databases = databases;
        this.database = String(databases[0]?.id ?? '');
        if (this.database) {
          this.selectDatabase();
        } else {
          this.loading = false;
        }
      },
      error: (error: unknown) => this.fail(error)
    });
  }

  get properties(): CosmosDbProperties | undefined {
    return this.resource?.properties || this.resource;
  }

  get accountName(): string {
    return String(this.resource?.name || this.resource?.id?.split('/').pop() || '');
  }

  get partitionPath(): string {
    const selected = this.containers.find((item) => item.id === this.container);
    const properties = selected?.['properties'] as { partitionKey?: { paths?: string[] } } | undefined;
    return properties?.partitionKey?.paths?.[0] ?? '';
  }

  selectDatabase(): void {
    this.containers = [];
    this.documents = [];
    this.container = '';
    this.loading = true;
    this.error = '';
    this.cosmos.listContainers(this.accountName, this.database).subscribe({
      next: (containers) => {
        this.containers = containers;
        this.container = String(containers[0]?.id ?? '');
        this.loading = false;
      },
      error: (error: unknown) => this.fail(error)
    });
  }

  search(): void {
    if (!this.database || !this.container) {
      return;
    }
    if (this.searchMode !== 'all' && !this.searchValue.trim()) {
      this.error = 'Enter a value for the selected search mode.';
      return;
    }
    if (this.searchMode === 'partition' && !this.partitionPath) {
      this.error = 'The selected container does not expose a partition key path.';
      return;
    }

    this.loading = true;
    this.error = '';
    const limit = Math.max(1, Math.min(100, Number(this.resultLimit) || 50));
    this.resultLimit = limit;
    this.cosmos.queryDocuments(
      this.accountName,
      this.database,
      this.container,
      this.searchMode,
      this.searchValue.trim(),
      this.partitionPath,
      limit
    ).subscribe({
      next: (documents) => {
        this.documents = documents;
        this.loading = false;
      },
      error: (error: unknown) => this.fail(error)
    });
  }

  formatted(document: CosmosResource<unknown>): string {
    return JSON.stringify(document, null, 2);
  }

  private fail(error: unknown): void {
    this.loading = false;
    if (error instanceof HttpErrorResponse) {
      const details = this.errorDetails(error.error);
      this.error = details
        ? `Cosmos DB request failed (${error.status}): ${details}`
        : `Cosmos DB request failed (${error.status} ${error.statusText}).`;
      console.error('Cosmos DB request failed.', error);
      return;
    }

    this.error = error instanceof Error ? error.message : 'Cosmos DB request failed.';
    console.error('Cosmos DB request failed.', error);
  }

  private errorDetails(body: unknown): string {
    if (typeof body === 'string') {
      try {
        return this.errorDetails(JSON.parse(body));
      } catch {
        return body;
      }
    }

    if (body && typeof body === 'object') {
      const response = body as { message?: unknown; Message?: unknown; error?: unknown };
      if (typeof response.message === 'string') {
        return response.message;
      }
      if (typeof response.Message === 'string') {
        return response.Message;
      }
      if (typeof response.error === 'string') {
        return response.error;
      }
    }

    return '';
  }
}
