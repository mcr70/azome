import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TableColumn {
  key: string;
  label: string;
}

@Component({
  selector: 'app-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './table.component.html',
  styleUrl: './table.component.scss'
})
export class TableComponent {
  @Input() columns: TableColumn[] = [];
  @Input() rows: any[] = [];
  @Input() selectable = false;
  @Input() selectedIndices = new Set<number>();
  @Input() showDelete = true;
  @Input() expandedRowIndex: number | null = null;

  @Output() rowClick = new EventEmitter<{ row: any; index: number }>();
  @Output() deleteRow = new EventEmitter<{ row: any; index: number }>();
  @Output() selectionChange = new EventEmitter<number[]>();

  public getCellValue(row: any, key: string): string {
    const val = row[key];
    if (val === null || val === undefined) return '—';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }

  public onRowClick(row: any, index: number, event: Event): void {
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;
    this.rowClick.emit({ row, index });
  }

  public onDelete(row: any, index: number, event: Event): void {
    event.stopPropagation();
    this.deleteRow.emit({ row, index });
  }

  public onToggleSelect(index: number, event: Event): void {
    event.stopPropagation();
    const newSelection = new Set(this.selectedIndices);
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      newSelection.add(index);
    } else {
      newSelection.delete(index);
    }
    this.selectionChange.emit(Array.from(newSelection));
  }
}