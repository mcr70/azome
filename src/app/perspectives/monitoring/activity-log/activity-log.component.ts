import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { TextFilterComponent } from '@components/text-filter/text-filter.component';
import { ActivityLogEvent } from '@services/azure/monitoring.service';
import { ActivityLogDetailComponent } from './activity-log-detail.component';
import { matchesTextFilter } from '@app/utils/text-filter';
import { SelectedAzureResource } from '@services/azome/resource-selection.service';

interface ActivityLogFilter {
  query: string;
  resourceIds: string[];
}

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
  @Input() selectedResources: SelectedAzureResource[] = [];

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  public readonly displayedColumns = ['time', 'operation', 'status', 'resourceGroup', 'caller'];
  public readonly dataSource = new MatTableDataSource<ActivityLogEvent>([]);
  public filterQuery = '';
  public selectedEvent: ActivityLogEvent | null = null;

  constructor(private host: ElementRef<HTMLElement>) {
    this.dataSource.filterPredicate = (event, filter) => {
      const parsedFilter = JSON.parse(filter) as ActivityLogFilter;
      const matchesResource = parsedFilter.resourceIds.length === 0
        || this.matchesSelectedResource(event, parsedFilter.resourceIds);

      return matchesResource && matchesTextFilter(parsedFilter.query, JSON.stringify(event));
    };
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['events']) {
      this.dataSource.data = this.events;
    }

    this.updateDataSourceFilter();

    if (changes['selectedResources'] && this.selectedResources.length > 0) {
      setTimeout(() => {
        this.host.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  public ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
  }

  public applyFilter(value: string): void {
    this.filterQuery = value;
    this.updateDataSourceFilter();
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

  private updateDataSourceFilter(): void {
    const filter: ActivityLogFilter = {
      query: this.filterQuery.trim().toLocaleLowerCase(),
      resourceIds: this.selectedResources.map((resource) => this.normalizeId(resource.id))
    };

    this.dataSource.filter = JSON.stringify(filter);
    this.paginator?.firstPage();
  }

  private matchesSelectedResource(event: ActivityLogEvent, resourceIds: string[]): boolean {
    const eventResourceId = this.normalizeId(event.resourceId ?? '');
    return resourceIds.some((resourceId) =>
      eventResourceId === resourceId || eventResourceId.startsWith(`${resourceId}/`)
    );
  }

  private normalizeId(resourceId: string): string {
    return resourceId.replace(/\/+$/, '').toLocaleLowerCase();
  }
}
