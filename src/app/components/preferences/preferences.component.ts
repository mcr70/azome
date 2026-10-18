import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray
} from '@angular/cdk/drag-drop';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  DEFAULT_PERSPECTIVES,
  PerspectivePreference
} from './perspective-preference.model';

@Component({
  selector: 'app-preferences',
  standalone: true,
  imports: [CdkDrag, CdkDragHandle, CdkDropList],
  templateUrl: './preferences.component.html',
  styleUrl: './preferences.component.scss'
})
export class PreferencesComponent {
  @Input({ required: true }) preferences: PerspectivePreference[] = [];
  @Input() error: string | null = null;
  @Output() preferencesChange = new EventEmitter<PerspectivePreference[]>();
  @Output() close = new EventEmitter<void>();

  public drop(event: CdkDragDrop<PerspectivePreference[]>): void {
    const preferences = [...this.preferences];
    moveItemInArray(preferences, event.previousIndex, event.currentIndex);
    this.preferencesChange.emit(preferences);
  }

  public toggleVisibility(preferenceId: string, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    const enabledCount = this.preferences.filter((preference) => preference.visible).length;
    const preference = this.preferences.find((item) => item.id === preferenceId);

    if (!preference || (preference.visible && enabledCount === 1 && !checkbox.checked)) {
      checkbox.checked = true;
      return;
    }

    this.preferencesChange.emit(this.preferences.map((item) =>
      item.id === preferenceId
        ? { ...item, visible: checkbox.checked }
        : item
    ));
  }

  public reset(): void {
    this.preferencesChange.emit(DEFAULT_PERSPECTIVES.map((preference) => ({ ...preference })));
  }

  public canHide(preference: PerspectivePreference): boolean {
    return !preference.visible
      || this.preferences.filter((item) => item.visible).length > 1;
  }
}
