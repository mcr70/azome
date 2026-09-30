import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription } from 'rxjs';
import {
  StorageAccountService,
  TableEntity,
  TableItem
} from '../../../../../services/azure/storage-account.service';

@Component({
  selector: 'app-table-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './table-browser.component.html',
  styleUrl: '../blob-browser/storage-browser.component.scss'
})
export class TableBrowserComponent implements OnInit, OnDestroy {
  @Input({ required: true }) resourceId = '';

  tables: TableItem[] = [];
  entities: TableEntity[] = [];
  table = '';
  partitionKey = '';
  rowKey = '';
  selected?: TableEntity;
  loading = false;
  error = '';

  private readonly subs = new Subscription();

  constructor(private readonly storage: StorageAccountService) {}

  ngOnInit(): void {
    this.run(this.storage.listTables(this.resourceId), (tables) => {
      this.tables = tables;
      if (tables.length > 0) {
        this.selectTable(tables[0].name);
      }
    });
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  selectTable(name: string): void {
    this.table = name;
    this.entities = [];
    this.selected = undefined;
  }

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

  stringify(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }

  private run<T>(request: Observable<T>, accept: (value: T) => void): void {
    this.loading = true;
    this.error = '';
    this.subs.add(request.subscribe({
      next: (value) => accept(value),
      error: (error) => {
        this.error = error?.error?.error?.message
          || error?.error?.message
          || error?.message
          || 'Storage request failed.';
        this.loading = false;
      },
      complete: () => this.loading = false
    }));
  }
}
