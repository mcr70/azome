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
import {
  ResourceSelectionService,
  SelectedAzureResource
} from '@services/azome/resource-selection.service';

interface ActivityLogFilter {
  query: string;
  resourceIds: string[];
}

/**
 * Paged activity log table of the Monitoring perspective.
 *
 * Filters events by free text and by the shared resource selection, and lets
 * the user open event details or add event resources to the selection.
 */
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

  public readonly displayedColumns = ['select', 'time', 'operation', 'status', 'resourceGroup', 'caller'];
  public readonly dataSource = new MatTableDataSource<ActivityLogEvent>([]);
  public filterQuery = '';
  public selectedEvent: ActivityLogEvent | null = null;

  constructor(
    private host: ElementRef<HTMLElement>,
    public resourceSelection: ResourceSelectionService
  ) {
    this.dataSource.filterPredicate = (event, filter) => {
      const parsedFilter = JSON.parse(filter) as ActivityLogFilter;
      const matchesResource = parsedFilter.resourceIds.length === 0
        || this.matchesSelectedResource(event, parsedFilter.resourceIds);

      return matchesResource && matchesTextFilter(parsedFilter.query, JSON.stringify(event));
    };
  }

  /**
   * Pushes new events into the table and re-applies the active filter. When
   * the shared selection changes, the log scrolls itself into view.
   *
   * @param changes Angular input changes for this component.
   */
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


  /**
   * Applies a new text filter to the event table.
   *
   * @param value Filter text entered by the user.
   */
  public applyFilter(value: string): void {
    this.filterQuery = value;
    this.updateDataSourceFilter();
  }

  /**
   * Human-readable operation name of an event.
   *
   * @param event Activity log event.
   * @returns The localized or raw operation name.
   */
  public operationName(event: ActivityLogEvent): string {
    return event.operationName?.localizedValue || event.operationName?.value || 'Unknown operation';
  }

  /**
   * Human-readable status of an event.
   *
   * @param event Activity log event.
   * @returns The localized or raw status.
   */
  public statusName(event: ActivityLogEvent): string {
    return event.status?.localizedValue || event.status?.value || 'Unknown';
  }

  /**
   * Opens the detail panel for an event.
   *
   * @param event Activity log event to inspect.
   */
  public openDetails(event: ActivityLogEvent): void {
    this.selectedEvent = event;
  }

  /**
   * Opens the detail panel with Enter or Space when a table row has focus.
   *
   * @param keyboardEvent Keyboard event raised on the row.
   * @param event Activity log event of the row.
   */
  public onRowKeydown(keyboardEvent: KeyboardEvent, event: ActivityLogEvent): void {
    if (keyboardEvent.target !== keyboardEvent.currentTarget) {
      return;
    }

    if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
      keyboardEvent.preventDefault();
      this.openDetails(event);
    }
  }

  /**
   * Tells whether the resource of an event is in the shared selection.
   *
   * @param event Activity log event.
   * @returns True when the event resource is selected.
   */
  public isEventSelected(event: ActivityLogEvent): boolean {
    return Boolean(event.resourceId && this.resourceSelection.isSelected(event.resourceId));
  }

  /**
   * Adds or removes the resource of an event in the shared selection when its
   * row checkbox changes.
   *
   * @param changeEvent Change event of the checkbox.
   * @param event Activity log event of the row.
   */
  public onEventSelectionChange(changeEvent: Event, event: ActivityLogEvent): void {
    if (!event.resourceId) {
      return;
    }

    const checkbox = changeEvent.target as HTMLInputElement;
    if (checkbox.checked) {
      const resource = this.resourceFromEvent(event);
      if (resource) {
        this.resourceSelection.select(resource);
      }
      return;
    }

    this.resourceSelection.deselect(event.resourceId);
  }

  /** Serializes the current text and resource filters into the data source. */
  private updateDataSourceFilter(): void {
    const filter: ActivityLogFilter = {
      query: this.filterQuery.trim().toLocaleLowerCase(),
      resourceIds: this.selectedResources.map((resource) => this.normalizeId(resource.id))
    };

    this.dataSource.filter = JSON.stringify(filter);
    this.paginator?.firstPage();
  }

  /**
   * Tells whether an event belongs to one of the selected resources or their
   * child resources.
   *
   * @param event Activity log event.
   * @param resourceIds Normalized IDs of the selected resources.
   * @returns True when the event resource matches a selected resource.
   */
  private matchesSelectedResource(event: ActivityLogEvent, resourceIds: string[]): boolean {
    const eventResourceId = this.normalizeId(event.resourceId ?? '');
    return resourceIds.some((resourceId) =>
      eventResourceId === resourceId || eventResourceId.startsWith(`${resourceId}/`)
    );
  }

  /**
   * Normalizes a resource ID for comparisons.
   *
   * @param resourceId Raw resource ID.
   * @returns Lower-cased ID without trailing slashes.
   */
  private normalizeId(resourceId: string): string {
    return resourceId.replace(/\/+$/, '').toLocaleLowerCase();
  }

  /**
   * Builds a selectable resource from the resource ID of an event by parsing
   * the provider, type, and name segments of the ARM resource ID.
   *
   * @param event Activity log event.
   * @returns The selection entry, or null when the event has no resource ID.
   */
  private resourceFromEvent(event: ActivityLogEvent): SelectedAzureResource | null {
    const id = event.resourceId?.trim();
    if (!id) {
      return null;
    }

    const segments = id.split('/').filter(Boolean);
    const providerIndex = segments.findIndex((segment) => segment.toLocaleLowerCase() === 'providers');
    const provider = providerIndex >= 0 ? segments[providerIndex + 1] : null;
    const resourceTypes: string[] = [];
    const resourceNames: string[] = [];

    if (providerIndex >= 0) {
      for (let index = providerIndex + 2; index < segments.length; index += 2) {
        resourceTypes.push(segments[index]);
        if (segments[index + 1]) {
          resourceNames.push(segments[index + 1]);
        }
      }
    }

    const resourceGroupIndex = segments.findIndex(
      (segment) => segment.toLocaleLowerCase() === 'resourcegroups'
    );

    return {
      id,
      type: provider ? `${provider}/${resourceTypes.join('/')}` : 'Unknown',
      name: resourceNames.at(-1) ?? segments.at(-1) ?? id,
      resourceGroup: event.resourceGroupName
        ?? (resourceGroupIndex >= 0 ? segments[resourceGroupIndex + 1] : '')
    };
  }
}
