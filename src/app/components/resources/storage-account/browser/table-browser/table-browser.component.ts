
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  StorageAccountService,
  TableEntity,
  TableItem
} from '../../../../../services/azure/storage-account.service';
import { StorageBrowserBase } from '../storage-browser-base';

@Component({
  selector: 'app-table-browser',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './table-browser.component.html',
  styleUrl: '../blob-browser/storage-browser.component.scss'
})
export class TableBrowserComponent extends StorageBrowserBase implements OnInit, OnDestroy {
  @Input({ required: true }) resourceId = '';

  tables: TableItem[] = [];
  entities: TableEntity[] = [];
  table = '';
  partitionKey = '';
  rowKey = '';
  selected?: TableEntity;
  constructor(private readonly storage: StorageAccountService) {
    super();
  }

  ngOnInit(): void {
    this.run(this.storage.listTables(this.resourceId), (tables) => {
      this.tables = tables;
      if (tables.length > 0) {
        this.selectTable(tables[0].name);
      }
    });
  }

  ngOnDestroy(): void {
    this.dispose();
  }

  /** Selects a table and clears results from the previously selected table. */
  selectTable(name: string): void {
    this.table = name;
    this.entities = [];
    this.selected = undefined;
  }

  /** Queries entities using the optional PartitionKey and RowKey values. */
  query(): void {
    if (!this.table) {
      return;
    }

    const clauses: string[] = [];
    if (this.partitionKey.trim()) {
      clauses.push(
        "PartitionKey eq '" + this.partitionKey.trim().replace(/'/g, "''") + "'"
      );
    }
    if (this.rowKey.trim()) {
      clauses.push("RowKey eq '" + this.rowKey.trim().replace(/'/g, "''") + "'");
    }

    this.selected = undefined;
    this.run(
      this.storage.queryTableEntities(this.resourceId, this.table, clauses.join(' and ')),
      (entities) => this.entities = entities
    );
  }

  /** Serializes a table entity as formatted JSON for the detail panel. */
  stringify(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }
}
