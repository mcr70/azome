import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MetricTimeRangeOption, TIME_RANGES } from '../../perspectives/monitoring/metrics/metrics.model';
import { LocalStorageService } from '@services/azome/local-storage.service';

const STORAGE_KEY = 'azome.timeRange';

export type TimeRangeLabelPosition = 'top' | 'left' | 'none';

/**
 * Re-usable time-range selector shared across azome views.
 *
 * On init it restores the last selected range from local storage (key `azome.timeRange`)
 * and emits it to the parent. When no stored value exists it keeps the parent-provided
 * value, or falls back to the first option in `TIME_RANGES`.
 *
 * The component works with the `MetricTimeRange` values defined in `metrics.model.ts`.
 */
@Component({
  selector: 'app-time-range-select',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './time-range-select.component.html',
  styleUrls: ['./time-range-select.component.scss'],
})
export class TimeRangeSelectComponent implements OnInit {
  /** Current selected value (two-way bound). */
  @Input() value = '';

  /** Where the "Time range" label is rendered relative to the select. */
  @Input() labelPosition: TimeRangeLabelPosition = 'top';

  /** Disables the select, e.g. while a query is running. */
  @Input() disabled = false;

  /** Emits when the selected range changes (including the restored value on init). */
  @Output() valueChange = new EventEmitter<string>();

  /** Options displayed in the `<select>`. */
  public readonly timeRanges: MetricTimeRangeOption[] = TIME_RANGES;

  constructor(private readonly storage: LocalStorageService) {}

  /**
   * Restores the persisted time range, or falls back to the parent value / first option.
   */
  ngOnInit(): void {
    const stored = this.storage.getItem(STORAGE_KEY);

    if (stored && this.isKnownRange(stored)) {
      if (stored !== this.value) {
        this.value = stored;
        this.valueChange.emit(stored);
      }
      return;
    }

    // No stored value – keep a valid parent-provided value, otherwise use the first option.
    if (!this.isKnownRange(this.value)) {
      this.value = this.timeRanges[0].value;
      this.valueChange.emit(this.value);
    }
  }

  /**
   * Handles a user selection: emits the new value and persists it.
   *
   * @param newValue Selected time-range value.
   */
  public onSelect(newValue: string): void {
    this.value = newValue;
    this.valueChange.emit(newValue);
    this.storage.setItem(STORAGE_KEY, newValue);
  }

  /**
   * Checks whether the given value is one of the known time-range options.
   *
   * @param value Candidate time-range value.
   * @returns `true` when the value matches a known option.
   */
  private isKnownRange(value: string): boolean {
    return this.timeRanges.some((option) => option.value === value);
  }
}
