import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { ResourceSelectionService } from '@services/azome/resource-selection.service';
import { ResourceSelectionBarComponent } from './resource-selection-bar.component';

describe('ResourceSelectionBarComponent', () => {
  let fixture: ComponentFixture<ResourceSelectionBarComponent>;
  let selection: ResourceSelectionService;
  let overlay: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResourceSelectionBarComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(ResourceSelectionBarComponent);
    selection = TestBed.inject(ResourceSelectionService);
    overlay = TestBed.inject(OverlayContainer).getContainerElement();
    fixture.detectChanges();
  });

  it('shows the summary immediately after selection and clears it using Clear selection', () => {
    expect(fixture.nativeElement.querySelector('.resource-selection-bar')).toBeNull();
    selection.select({ id: 'id', name: 'Example', type: 'test/resource', resourceGroup: 'group' });
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Selected resources');
    expect(element.querySelector('.selection-count')?.textContent).toBe('1');
    expect(element.querySelector('.selected-resource-name')).toBeNull();
    expect(overlay.querySelector('[role="dialog"]')).toBeNull();
    expect(element.querySelector('.selection-mode-button')).toBeNull();

    element.querySelector<HTMLButtonElement>('.selection-summary')!.click();
    fixture.detectChanges();
    expect(overlay.querySelector('.selected-resource-name')?.textContent).toContain('Example');
    overlay.querySelector<HTMLButtonElement>('.clear-selection-button')!.click();
    fixture.detectChanges();
    expect(selection.selectedResources).toEqual([]);
    expect(element.querySelector('.resource-selection-bar')).toBeNull();
    expect(overlay.querySelector('[role="dialog"]')).toBeNull();
  });

  it('removes individual resources and closes the panel after the last selection is removed', () => {
    selection.select({ id: 'first', name: 'First', type: 'test/resource', resourceGroup: 'group' });
    selection.select({ id: 'second', name: 'Second', type: 'test/resource', resourceGroup: 'group' });
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.selection-summary').click();
    fixture.detectChanges();

    overlay.querySelector<HTMLButtonElement>('[aria-label="Deselect First"]')!.click();
    fixture.detectChanges();
    expect(selection.isSelected('first')).toBeFalse();
    expect(selection.isSelected('second')).toBeTrue();
    expect(overlay.querySelectorAll('li').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.selection-count').textContent).toBe('1');
    expect(fixture.componentInstance.isOpen).toBeTrue();

    overlay.querySelector<HTMLButtonElement>('[aria-label="Deselect Second"]')!.click();
    fixture.detectChanges();
    expect(selection.selectedResources).toEqual([]);
    expect(fixture.componentInstance.isOpen).toBeFalse();
    expect(overlay.querySelector('[role="dialog"]')).toBeNull();
  });

  it('closes using Escape or the close button without changing selection', () => {
    selection.select({ id: 'id', name: 'Example', type: 'test/resource', resourceGroup: 'group' });
    fixture.detectChanges();
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('.selection-summary');
    trigger.click();
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    overlay.querySelector<HTMLElement>('[role="dialog"]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(selection.selectedResources.length).toBe(1);

    trigger.click();
    fixture.detectChanges();
    overlay.querySelector<HTMLButtonElement>('.close-panel-button')!.click();
    fixture.detectChanges();
    expect(overlay.querySelector('[role="dialog"]')).toBeNull();
    expect(selection.selectedResources.length).toBe(1);
  });

  it('closes on an outside click without clearing selection', () => {
    selection.select({ id: 'id', name: 'Example', type: 'test/resource', resourceGroup: 'group' });
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.selection-summary').click();
    fixture.detectChanges();
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.isOpen).toBeFalse();
    expect(selection.isSelected('id')).toBeTrue();
  });
});
