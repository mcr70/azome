import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ResourceDetailItem } from '@services/azome/resource-detail.registry';
import { CosmosDbService, CosmosResource } from '@services/azure/cosmosdb.service';
import { QueryEditorComponent } from '@app/components/query-editor/query-editor.component';
import { cosmosSqlEditorExtensions } from '@app/components/query-editor/extensions/cosmos-sql';
import { TableComponent, TableColumn } from '@app/components/table/table.component';

@Component({
  selector: 'app-cosmos-db-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, QueryEditorComponent, TableComponent],
  templateUrl: './cosmosdb.component.html',
  styleUrl: './cosmosdb.component.scss'
})
export class CosmosDbComponent implements ResourceDetailItem, OnInit {
  @Input() public resource: any;

  @Input() public view: 'overview' | 'browse' = 'browse';
  public properties: any = null;

  public databases: CosmosResource<unknown>[] = [];
  public containers: CosmosResource<unknown>[] = [];
  public database = '';
  public container = '';
  public searchMode: 'all' | 'partition' | 'id' | 'sql' = 'all';
  public searchValue = '';
  public sqlQuery = 'SELECT * FROM c';
  public resultLimit = 50;
  public partitionPath = '/category';
  
  public results: any[] | null = null;
  public loading = false;
  public error: string | null = null;

  public createDialogOpen = false;
  public creatingDocument = false;
  public newDocumentJson = '{\n  "id": "new-doc-id",\n  "category": "sample",\n  "name": "Sample Record"\n}';

  // Table component state
  public tableColumns: TableColumn[] = [];
  public expandedRowIndex: number | null = null;
  public selectedDocumentIndices = new Set<number>();

  public readonly cosmosSqlEditorExtensions = cosmosSqlEditorExtensions(() => ({
    properties: ['id', 'name', 'category', 'status', 'partitionKey', 'properties']
  }));

  constructor(private cosmosService: CosmosDbService) {}

  ngOnInit(): void {
    if (this.resource?.properties) {
      this.properties = this.resource.properties;
    }
    this.loadDatabases();
  }

  public loadDatabases(): void {
    if (!this.resource?.name) {
      return;
    }
    this.loading = true;
    this.error = null;
    this.cosmosService.listDatabases(this.resource.name).subscribe({
      next: (dbs) => {
        this.databases = dbs;
        this.loading = false;
        if (dbs.length > 0 && dbs[0].id) {
          this.database = dbs[0].id;
          this.loadContainers();
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = 'Failed to load databases: ' + (err.error?.message || err.message);
      }
    });
  }

  public selectDatabase(): void {
    this.loadContainers();
  }

  public loadContainers(): void {
    if (!this.resource?.name || !this.database) {
      return;
    }
    this.loading = true;
    this.error = null;
    this.cosmosService.listContainers(this.resource.name, this.database).subscribe({
      next: (cols) => {
        this.containers = cols;
        this.loading = false;
        if (cols.length > 0 && cols[0].id) {
          this.container = cols[0].id;
          this.updatePartitionPath();
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = 'Failed to load containers: ' + (err.error?.message || err.message);
      }
    });
  }

  public updatePartitionPath(): void {
    const containerObj = this.containers.find((c) => c.id === this.container) as any;
    if (containerObj?.partitionKey?.paths?.[0]) {
      this.partitionPath = containerObj.partitionKey.paths[0];
    } else {
      this.partitionPath = '/category';
    }
  }

public search(): void {
    if (!this.resource?.name || !this.database || !this.container) {
      return;
    }
    this.loading = true;
    this.error = null;
    this.results = null;

    const queryOrValue = this.searchMode === 'sql' ? this.sqlQuery : this.searchValue;

    console.log('Search parameters:', {
      resourceName: this.resource?.name,
      database: this.database,
      container: this.container,
      searchMode: this.searchMode,
      queryOrValue, 
      partitionPath: this.partitionPath,
      resultLimit: this.resultLimit
    });

    this.cosmosService.queryDocuments(
      this.resource.name,
      this.database,
      this.container,
      this.searchMode,
      queryOrValue, 
      this.partitionPath,
      this.resultLimit
    ).subscribe({
      next: (docs) => {
        this.results = docs;
        this.loading = false;
        this.setupTableColumns();
      },
      error: (err) => {
        this.error = err.error?.message || err.message || 'Query failed';
        this.loading = false;
      }
    });
  }

  private setupTableColumns(): void {
    if (!this.results || this.results.length === 0) {
      this.tableColumns = [];
      return;
    }

    const firstRow = this.results[0];
    const keys = Object.keys(firstRow).filter((k) => !k.startsWith('_'));
    const cleanPartitionKey = this.partitionPath.replace('/', '');
    const priorityKeys = ['id', cleanPartitionKey].filter(Boolean);

    const otherKeys = keys.filter((k) => !priorityKeys.includes(k));
    const sortedKeys = [...priorityKeys, ...otherKeys].slice(0, 6);

    this.tableColumns = sortedKeys.map((key) => ({
      key,
      label: key === cleanPartitionKey ? `Partition (${this.partitionPath})` : key.toUpperCase()
    }));
  }

  public toggleRowExpansion(index: number): void {
    this.expandedRowIndex = this.expandedRowIndex === index ? null : index;
  }

  public openCreateDialog(): void {
    this.createDialogOpen = true;
    this.error = null;
  }

  public createDocument(): void {
    if (!this.resource?.name || !this.database || !this.container) {
      return;
    }

    let parsedDoc: any;
    try {
      parsedDoc = JSON.parse(this.newDocumentJson);
    } catch (e) {
      this.error = 'Invalid JSON format in document payload.';
      return;
    }

    const cleanPartitionKey = this.partitionPath.replace('/', '');
    const partitionKeyValue = parsedDoc[cleanPartitionKey];

    this.creatingDocument = true;
    this.error = null;

    this.cosmosService.createDocument(
      this.resource.name,
      this.database,
      this.container,
      parsedDoc,
      partitionKeyValue
    ).subscribe({
      next: () => {
        this.creatingDocument = false;
        this.createDialogOpen = false;
        this.search();
      },
      error: (err) => {
        this.creatingDocument = false;
        this.error = 'Failed to create document: ' + (err.error?.message || err.message);
      }
    });
  }

  public deleteDocument(event: { row: any; index: number }): void {
    const { row, index } = event;
    const docId = row.id;
    const cleanPartitionKey = this.partitionPath.replace('/', '');
    const pkValue = row[cleanPartitionKey];

    if (!confirm(`Are you sure you want to delete document ${docId} (Partition: ${pkValue})?`)) {
      return;
    }

    this.cosmosService.deleteDocument(
      this.resource.name,
      this.database,
      this.container,
      docId,
      pkValue
    ).subscribe({
      next: () => {
        this.results = this.results?.filter((_, i) => i !== index) || [];
        this.expandedRowIndex = null;
      },
      error: (err) => {
        console.error('Failed to delete document from Cosmos DB:', err);
        alert('Deletion failed: ' + (err.error?.message || err.message));
      }
    });
  }

  public deleteSelectedDocuments(): void {
    if (this.selectedDocumentIndices.size === 0 || !this.results) {
      return;
    }

    if (!confirm(`Are you sure you want to delete ${this.selectedDocumentIndices.size} selected document(s)?`)) {
      return;
    }

    const indicesToDelete = Array.from(this.selectedDocumentIndices).sort((a, b) => b - a);
    
    for (const index of indicesToDelete) {
      const row = this.results[index];
      if (row) {
        const docId = row.id;
        const cleanPartitionKey = this.partitionPath.replace('/', '');
        const pkValue = row[cleanPartitionKey];

        this.cosmosService.deleteDocument(
          this.resource.name,
          this.database,
          this.container,
          docId,
          pkValue
        ).subscribe({
          error: (err) => console.error(`Failed to delete document ${docId}:`, err)
        });
      }
    }

    this.results = this.results.filter((_, i) => !this.selectedDocumentIndices.has(i));
    this.selectedDocumentIndices.clear();
    this.expandedRowIndex = null;
  }  

  public updateSelection(indices: number[]): void {
    this.selectedDocumentIndices = new Set(indices);
  }
}