import { AfterViewInit, Component, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { TextFilterComponent } from '../../../components/text-filter.component';
import { ActivityLogEvent } from '../../../services/azure/monitoring.service';
import { ActivityLogDetailComponent } from './activity-log-detail.component';
import { matchesTextFilter } from '../../../utils/text-filter';

@Component({
  selector: 'app-activity-log',
  standalone: true,
  imports: [
    CommonModule,
    MatPaginatorModule,
    MatTableModule,
    TextFilterComponent,
    ActivityLogDetailComponent
  ],
  templateUrl: './activity-log.component.html',
  styleUrl: './activity-log.component.scss'
})
export class ActivityLogComponent implements AfterViewInit, OnChanges {
  @Input() events: ActivityLogEvent[] = [];

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  public readonly displayedColumns = ['time', 'operation', 'status', 'resourceGroup', 'caller'];
  public readonly dataSource = new MatTableDataSource<ActivityLogEvent>([]);
  public filterQuery = '';
  public selectedEvent: ActivityLogEvent | null = null;

  constructor() {
    this.dataSource.filterPredicate = (event, filter) =>
      matchesTextFilter(filter, JSON.stringify(event));
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['events']) {
      this.dataSource.data = this.events;
      this.paginator?.firstPage();
    }
  }

  public ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
  }

  public applyFilter(value: string): void {
    this.filterQuery = value;
    this.dataSource.filter = value.trim().toLocaleLowerCase();
  }

  public operationName(event: ActivityLogEvent): string {
    return event.operationName?.localizedValue || event.operationName?.value || 'Unknown operation';
  }

  public statusName(event: ActivityLogEvent): string {
    return event.status?.localizedValue || event.status?.value || 'Unknown';
  }

  public openDetails(event: ActivityLogEvent): void {
    this.selectedEvent = event;
  }

  public onRowKeydown(keyboardEvent: KeyboardEvent, event: ActivityLogEvent): void {
    if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
      keyboardEvent.preventDefault();
      this.openDetails(event);
    }
  }
}
