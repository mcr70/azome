import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ResourceSelectionService } from '@services/azome/resource-selection.service';
import { ResourceCardComponent } from './resource-card.component';

@Component({
  standalone: true,
  imports: [ResourceCardComponent],
  template: `
    <app-resource-card
      type="test/resource"
      name="Example"
      [resourceId]="resourceId"
      resourceGroup="group"
      [selectable]="selectable"
      [hasFooter]="true">
      <button card-actions type="button" (click)="detailsOpened = true">
        <span>Details</span>
      </button>
      <span card-metadata>Metadata</span>
      <div card-footer>
        <a href="#browse" (click)="$event.preventDefault()">Browse</a>
        <label>
          Option
          <input type="checkbox">
        </label>
      </div>
    </app-resource-card>
  `
})
class TestHostComponent {
  public resourceId: string | null = 'resource-id';

  public selectable = true;

  public detailsOpened = false;
}

describe('ResourceCardComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let element: HTMLElement;
  let selection: ResourceSelectionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TestHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(TestHostComponent);
    element = fixture.nativeElement;
    selection = TestBed.inject(ResourceSelectionService);
    fixture.detectChanges();
  });

  it('toggles selection immediately from the card title, metadata and background', () => {
    element.querySelector<HTMLElement>('.resource-name')!.click();
    fixture.detectChanges();
    expect(selection.isSelected('resource-id')).toBeTrue();
    expect(element.querySelector('.resource-card')?.classList.contains('selected')).toBeTrue();
    expect(element.querySelector('.resource-selection-toggle')?.getAttribute('aria-pressed')).toBe('true');

    element.querySelector<HTMLElement>('[card-metadata]')!.click();
    fixture.detectChanges();
    expect(selection.isSelected('resource-id')).toBeFalse();

    element.querySelector<HTMLElement>('.resource-card')!.click();
    expect(selection.selectedResources).toEqual([{
      id: 'resource-id',
      type: 'test/resource',
      name: 'Example',
      resourceGroup: 'group'
    }]);
  });

  it('provides a native selection button for keyboard activation without double toggling', () => {
    const button = element.querySelector<HTMLButtonElement>('.resource-selection-toggle')!;
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Select Example');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('does not toggle selection when using projected controls or their children', () => {
    element.querySelector<HTMLElement>('[card-actions] span')!.click();
    element.querySelector<HTMLAnchorElement>('a')!.click();
    element.querySelector<HTMLLabelElement>('label')!.click();
    element.querySelector<HTMLInputElement>('input')!.click();
    expect(fixture.componentInstance.detailsOpened).toBeTrue();
    expect(selection.selectedResources).toEqual([]);
  });

  it('does not toggle non-selectable cards or cards without a resource ID', () => {
    fixture.componentInstance.selectable = false;
    fixture.detectChanges();
    element.querySelector<HTMLElement>('.resource-card')!.click();
    expect(element.querySelector('.resource-selection-toggle')).toBeNull();
    expect(element.querySelector('.selectable')).toBeNull();
    expect(selection.selectedResources).toEqual([]);

    fixture.componentInstance.selectable = true;
    fixture.componentInstance.resourceId = null;
    fixture.detectChanges();
    element.querySelector<HTMLElement>('.resource-card')!.click();
    expect(element.querySelector('.resource-selection-toggle')).toBeNull();
    expect(selection.selectedResources).toEqual([]);
  });
});
