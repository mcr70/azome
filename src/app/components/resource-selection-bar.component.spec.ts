import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ResourceSelectionService } from '@services/azome/resource-selection.service';
import { ResourceSelectionBarComponent } from './resource-selection-bar.component';

describe('ResourceSelectionBarComponent', () => {
  let fixture: ComponentFixture<ResourceSelectionBarComponent>;
  let selection: ResourceSelectionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResourceSelectionBarComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(ResourceSelectionBarComponent);
    selection = TestBed.inject(ResourceSelectionService);
    fixture.detectChanges();
  });

  it('shows the summary immediately after selection and clears it using Clear selection', () => {
    expect(fixture.nativeElement.querySelector('.resource-selection-bar')).toBeNull();
    selection.select({ id: 'id', name: 'Example', type: 'test/resource', resourceGroup: 'group' });
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Selected resources');
    expect(element.querySelector('.selection-count')?.textContent).toBe('1');
    expect(element.querySelector('.selected-resource-name')?.textContent).toContain('Example');
    expect(element.querySelector('.selection-mode-button')).toBeNull();

    element.querySelector<HTMLButtonElement>('.clear-selection-button')!.click();
    fixture.detectChanges();
    expect(selection.selectedResources).toEqual([]);
    expect(element.querySelector('.resource-selection-bar')).toBeNull();
  });
});
