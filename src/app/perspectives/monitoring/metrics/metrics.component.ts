import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { SelectedAzureResource } from '@services/azome/resource-selection.service';
import { ResourceGraphDialogService } from '@services/azome/resource-graph-dialog.service';
import { TimeRangeSelectComponent } from '@components/time-range-select/time-range-select.component';
import { AutoMetricsComponent } from './auto-metrics.component';
import { MetricExplorerComponent } from './metric-explorer.component';
import { MetricTimeRange, MetricView, TIME_RANGES } from './metrics.model';

@Component({
  selector: 'app-monitoring-metrics',
  standalone: true,
  imports: [CommonModule, AutoMetricsComponent, MetricExplorerComponent, TimeRangeSelectComponent],
  templateUrl: './metrics.component.html',
  styleUrls: ['./metrics-shared.scss', './metrics.component.scss']
})
export class MetricsComponent implements OnChanges {
  @Input() resources: SelectedAzureResource[] = [];
  @Input() initialResource: SelectedAzureResource | null = null;
  @Input() initialResourceLoading = false;
  @Input() initialResourceError: string | null = null;

  @ViewChild('autoMetrics') public autoMetrics?: AutoMetricsComponent;
  @ViewChild('metricExplorer') public metricExplorer?: MetricExplorerComponent;

  public readonly metricViews: MetricView[] = ['auto', 'explorer'];
  public metricView: MetricView = 'auto';
  public timeRange: MetricTimeRange = '24h';
  public availableResources: SelectedAzureResource[] = [];

  private lastInitialResourceId: string | null = null;

  constructor(private readonly resourceGraphDialog: ResourceGraphDialogService) {}

  /**
   * Updates the resource list and opens Explorer when a new linked resource arrives.
   *
   * @param changes Angular input changes for this component.
   */
  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['resources'] || changes['initialResource']) {
      this.updateAvailableResources();
    }

    if (changes['initialResource']) {
      const currentResourceId = this.initialResource?.id.toLocaleLowerCase() ?? null;

      if (this.initialResource && currentResourceId !== this.lastInitialResourceId) {
        this.metricView = 'explorer';
      }

      this.lastInitialResourceId = currentResourceId;
    }
  }

  /**
   * Activates a metrics view.
   *
   * @param view View to activate.
   */
  public selectMetricView(view: MetricView): void {
    this.metricView = view;
  }

  /**
   * Selects a supported time range for both metric views.
   *
   * @param value Time-range option value.
   */
  public setTimeRange(value: string): void {
    const range = TIME_RANGES.find((option) => option.value === value);

    if (range) {
      this.timeRange = range.value;
    }
  }

  /**
   * Refreshes the active metric view.
   */
  public refreshMetrics(): void {
    if (this.metricView === 'auto') {
      this.autoMetrics?.refreshMetrics();
    } else {
      this.metricExplorer?.refreshMetrics();
    }
  }

  /**
   * Opens the Resource Graph query dialog.
   */
  public openResourceGraph(): void {
    this.resourceGraphDialog.requestOpen();
  }

  /**
   * Builds a stable, deduplicated list from selected and linked resources.
   */
  private updateAvailableResources(): void {
    const resources = new Map<string, SelectedAzureResource>();

    for (const resource of [...this.resources, ...(this.initialResource ? [this.initialResource] : [])]) {
      resources.set(resource.id.toLocaleLowerCase(), resource);
    }

    this.availableResources = Array.from(resources.values());
  }
}
