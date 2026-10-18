import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_PERSPECTIVES, PerspectivePreference } from './perspective-preference.model';
import { PreferencesComponent } from './preferences.component';

describe('PreferencesComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PreferencesComponent]
    }).compileComponents();
  });

  it('emits perspectives in the dragged order', () => {
    const fixture = TestBed.createComponent(PreferencesComponent);
    const component = fixture.componentInstance;
    component.preferences = DEFAULT_PERSPECTIVES.map((preference) => ({ ...preference }));
    let updated: PerspectivePreference[] = [];
    component.preferencesChange.subscribe((preferences) => updated = preferences);

    component.drop({
      previousIndex: 0,
      currentIndex: 2
    } as CdkDragDrop<PerspectivePreference[]>);

    expect(updated.map((preference) => preference.id)).toEqual([
      'networking',
      'monitoring',
      'resources',
      'data',
      'app'
    ]);
  });

  it('does not allow every perspective to be hidden', () => {
    const fixture = TestBed.createComponent(PreferencesComponent);
    const component = fixture.componentInstance;
    component.preferences = DEFAULT_PERSPECTIVES.map((preference) => ({
      ...preference,
      visible: preference.id === 'resources'
    }));
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = false;
    const changeEvent = new Event('change');
    Object.defineProperty(changeEvent, 'target', { value: checkbox });
    const changes = jasmine.createSpy('preferencesChange');
    component.preferencesChange.subscribe(changes);

    component.toggleVisibility('resources', changeEvent);

    expect(checkbox.checked).toBeTrue();
    expect(changes).not.toHaveBeenCalled();
  });
});
