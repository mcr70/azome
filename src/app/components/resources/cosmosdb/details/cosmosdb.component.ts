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
  private readonly systemDocumentFields = new Set([
    '_rid',
    '_self',
    '_etag',
    '_attachments',
    '_ts'
  ]);

  @Input() resource: any;
  @Input() view: 'overview' | 'browse' = 'overview';
  static readonly preferredVariant: PanelVariant = 'content';

  databases: CosmosResource<unknown>[] = [];
  containers: CosmosResource<unknown>[] = [];
  documents: CosmosResource<unknown>[] = [];
  expandedDocumentIndexes = new Set<number>();
  database = '';
  container = '';
  searchMode: 'all' | 'partition' | 'id' | 'sql' = 'all';
  searchValue = '';
  sqlQuery = 'SELECT * FROM c';
  resultLimit = 50;
  loading = false;
  error = '';
  createDialogOpen = false;
  newDocumentJson = '{\n  "id": "new-doc-id",\n  "name": "Sample Record"\n}';
  creatingDocument = false;

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
    const resource = selected as CosmosResource<unknown> & {
      properties?: { partitionKey?: { paths?: string[] } };
      partitionKey?: { paths?: string[] };
    } | undefined;
    return resource?.properties?.partitionKey?.paths?.[0]
      ?? resource?.partitionKey?.paths?.[0]
      ?? '';
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
    if (this.searchMode !== 'all' && this.searchMode !== 'sql' && !this.searchValue.trim()) {
      this.error = 'Enter a value for the selected search mode.';
      return;
    }
    if (this.searchMode === 'sql' && !this.sqlQuery.trim()) {
      this.error = 'Enter a SQL query.';
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
      this.searchMode === 'sql' ? this.sqlQuery.trim() : this.searchValue.trim(),
      this.partitionPath,
      limit
    ).subscribe({
      next: (documents) => {
        this.documents = documents;
        this.expandedDocumentIndexes = new Set<number>();
        this.loading = false;
      },
      error: (error: unknown) => this.fail(error)
    });
  }

  openCreateDialog(): void {
    this.error = '';
    this.newDocumentJson = JSON.stringify(this.documentTemplate(), null, 2);
    this.createDialogOpen = true;
  }

  createDocument(): void {
    this.error = '';
    let document: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(this.newDocumentJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        this.error = 'Document JSON must be an object.';
        return;
      }
      document = parsed as Record<string, unknown>;
    } catch {
      this.error = 'Enter valid JSON for the document.';
      return;
    }

    const partitionKey = this.partitionPath
      ? this.partitionKeyFromDocument(document)
      : { found: true, value: undefined };
    if (this.partitionPath && !partitionKey.found) {
      this.error = `Add a value at "${this.partitionPath}" in the document JSON.`;
      return;
    }

    this.creatingDocument = true;
    this.error = '';
    this.cosmos.createDocument(
      this.accountName,
      this.database,
      this.container,
      document,
      partitionKey.value
    ).subscribe({
      next: () => {
        this.creatingDocument = false;
        this.createDialogOpen = false;
        this.search();
      },
      error: (error: unknown) => {
        this.creatingDocument = false;
        this.error = this.formatError(error);
      }
    });
  }

  partitionValue(document: CosmosResource<unknown>): string {
    if (!this.partitionPath) {
      return '-';
    }

    const partitionKey = this.partitionKeyFromDocument(document as Record<string, unknown>);
    if (!partitionKey.found) {
      return '-';
    }
    return typeof partitionKey.value === 'string'
      ? partitionKey.value
      : JSON.stringify(partitionKey.value);
  }

  formattedUserData(document: CosmosResource<unknown>): string {
    const userData = Object.fromEntries(
      Object.entries(document).filter(([key]) => !this.systemDocumentFields.has(key))
    );
    return JSON.stringify(userData, null, 2);
  }

  toggleDocumentDetails(index: number): void {
    const expanded = new Set(this.expandedDocumentIndexes);
    if (expanded.has(index)) {
      expanded.delete(index);
    } else {
      expanded.add(index);
    }
    this.expandedDocumentIndexes = expanded;
  }

  private documentTemplate(): Record<string, unknown> {
    const document: Record<string, unknown> = {
      id: 'new-doc-id',
      name: 'Sample Record'
    };
    const path = this.partitionPath.split('/').filter(Boolean);
    if (path.length === 0) {
      return document;
    }

    let current = document;
    for (const segment of path.slice(0, -1)) {
      const child: Record<string, unknown> = {};
      current[segment] = child;
      current = child;
    }
    current[path[path.length - 1]] = 'sample';
    return document;
  }

  private partitionKeyFromDocument(
    document: Record<string, unknown>
  ): { found: boolean; value: unknown } {
    const path = this.partitionPath.split('/').filter(Boolean);
    let current: unknown = document;
    for (const segment of path) {
      if (!current || typeof current !== 'object' || !(segment in current)) {
        return { found: false, value: undefined };
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return { found: true, value: current };
  }

  private fail(error: unknown): void {
    this.loading = false;
    this.error = this.formatError(error);
  }

  private formatError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 409) {
        const documentId = this.documentIdFromJson();
        return documentId
          ? `A document with ID "${documentId}" already exists in this container. Change the ID and try again.`
          : 'A document with this ID already exists in the container. Change the ID and try again.';
      }

      const details = this.errorDetails(error.error);
      const message = details
        ? `Cosmos DB request failed (${error.status}): ${details}`
        : `Cosmos DB request failed (${error.status} ${error.statusText}).`;
      console.error('Cosmos DB request failed.', error);
      return message;
    }

    console.error('Cosmos DB request failed.', error);
    return error instanceof Error ? error.message : 'Cosmos DB request failed.';
  }

  private errorDetails(body: unknown): string {
    if (typeof body === 'string') {
      try {
        return this.errorDetails(JSON.parse(body));
      } catch {
        return this.simplifyCosmosMessage(body);
      }
    }

    if (body && typeof body === 'object') {
      const response = body as { message?: unknown; Message?: unknown; error?: unknown };
      if (typeof response.message === 'string') {
        return this.simplifyCosmosMessage(response.message);
      }
      if (typeof response.Message === 'string') {
        return this.simplifyCosmosMessage(response.Message);
      }
      if (typeof response.error === 'string') {
        return response.error;
      }
    }

    return '';
  }

  private documentIdFromJson(): string {
    try {
      const document = JSON.parse(this.newDocumentJson) as { id?: unknown };
      return typeof document.id === 'string' ? document.id : '';
    } catch {
      return '';
    }
  }

  private stripCosmosDiagnostics(message: string): string {
    const diagnosticsStart = message.indexOf(', {"Summary"');
    if (diagnosticsStart >= 0) {
      return message.slice(0, diagnosticsStart).trim();
    }

    const sdkDetailsStart = message.indexOf(', Windows/');
    if (sdkDetailsStart >= 0) {
      return message.slice(0, sdkDetailsStart).trim();
    }

    return message;
  }

  private simplifyCosmosMessage(message: string): string {
    const cleanMessage = this.stripCosmosDiagnostics(message);
    if (cleanMessage.toLowerCase().includes('partitionkey extracted from document')
      && cleanMessage.toLowerCase().includes("doesn't match")) {
      return `The partition key value in the document does not match the request value. `
        + `Check the value at "${this.partitionPath}" in the document JSON.`;
    }
    return cleanMessage;
  }
}
