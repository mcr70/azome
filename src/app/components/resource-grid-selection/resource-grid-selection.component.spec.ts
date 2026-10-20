import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ResourceSelectionService } from '@services/azome/resource-selection.service';
import { ResourceGridSelectionComponent } from './resource-grid-selection.component';

describe('ResourceGridSelectionComponent', () => {
  let fixture: ComponentFixture<ResourceGridSelectionComponent>;
  let selection: ResourceSelectionService;
  const first = { id: 'first', name: 'first', type: 'test/resource' };
  const second = { id: 'second', name: 'second', type: 'test/resource', resourceGroup: 'own-group' };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResourceGridSelectionComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(ResourceGridSelectionComponent);
    selection = TestBed.inject(ResourceSelectionService);
    fixture.componentRef.setInput('resources', [first, second]);
    fixture.componentRef.setInput('resourceGroup', 'fallback-group');
    fixture.componentRef.setInput('label', 'Test grid');
    fixture.detectChanges();
  });

  it('toggles between unchecked and checked with resource group metadata', () => {
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(checkbox.getAttribute('aria-label')).toBe('Select all in Test grid');
    expect(checkbox.checked).toBeFalse();
    expect(checkbox.indeterminate).toBeFalse();
    checkbox.click();
    fixture.detectChanges();
    expect(selection.selectedResources).toEqual([
      { ...first, resourceGroup: 'fallback-group' },
      second
    ]);
    expect(checkbox.checked).toBeTrue();
    expect(checkbox.indeterminate).toBeFalse();
    expect(checkbox.getAttribute('aria-label')).toBe('Deselect all in Test grid');
    checkbox.click();
    fixture.detectChanges();
    expect(selection.selectedResources).toEqual([]);
    expect(checkbox.checked).toBeFalse();
    expect(checkbox.indeterminate).toBeFalse();
  });

  it('shows mixed selection and selects all when the indeterminate checkbox is clicked', () => {
    selection.select({ ...first, resourceGroup: 'fallback-group' });
    fixture.detectChanges();
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(checkbox.checked).toBeFalse();
    expect(checkbox.indeterminate).toBeTrue();
    expect(checkbox.getAttribute('aria-label')).toBe('Select all in Test grid');

    checkbox.click();
    fixture.detectChanges();
    expect(selection.selectedResources.length).toBe(2);
    expect(checkbox.checked).toBeTrue();
    expect(checkbox.indeterminate).toBeFalse();

    selection.deselect(first.id);
    fixture.detectChanges();
    expect(checkbox.indeterminate).toBeTrue();
    selection.clear();
    fixture.detectChanges();
    expect(checkbox.checked).toBeFalse();
    expect(checkbox.indeterminate).toBeFalse();
  });

  it('uses only the visible resources after the grid changes', () => {
    selection.select({ ...first, resourceGroup: 'fallback-group' });
    fixture.componentRef.setInput('resources', [second]);
    fixture.detectChanges();
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector('input');
    checkbox.click();
    fixture.detectChanges();
    checkbox.click();
    expect(selection.selectedResources).toEqual([{ ...first, resourceGroup: 'fallback-group' }]);
  });

  it('does not render a checkbox for empty grids', () => {
    fixture.componentRef.setInput('resources', []);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
  });
});
