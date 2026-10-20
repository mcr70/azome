import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ResourceGroupListComponent } from './resource-group-list.component';
import { ResourceSelectionService } from '@services/azome/resource-selection.service';

describe('ResourceGroupListComponent', () => {
  let component: ResourceGroupListComponent;
  let fixture: ComponentFixture<ResourceGroupListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, ResourceGroupListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ResourceGroupListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('selects only filtered cards in a group and preserves other selections', () => {
    const first = { id: 'first', name: 'visible', type: 'test/resource' };
    const hidden = { id: 'hidden', name: 'hidden', type: 'test/resource' };
    const outside = { id: 'outside', name: 'outside', type: 'test/resource', resourceGroup: 'other' };
    const selection = TestBed.inject(ResourceSelectionService);
    component.loading = false;
    component.resourceGroups = [{ id: 'group', name: 'group', location: 'westeurope' }];
    component.groupResources = { group: [first, hidden] };
    component.expandedGroups.add('group');
    component.filterQuery = 'visible';
    fixture.detectChanges();
    selection.select(outside);
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelectorAll('app-resource-card').length).toBe(1);

    const selectAll = element.querySelector<HTMLInputElement>(
      '.resource-group-heading app-resource-grid-selection input'
    )!;
    expect(selectAll.closest('button')).toBeNull();
    selectAll.click();
    fixture.detectChanges();
    expect(selection.selectedResources).toEqual([outside, { ...first, resourceGroup: 'group' }]);
    expect(element.querySelector('.resource-card.selected')).not.toBeNull();
    expect(component.isGroupExpanded('group')).toBeTrue();
    expect(selectAll.checked).toBeTrue();

    selectAll.click();
    fixture.detectChanges();
    expect(selection.selectedResources).toEqual([outside]);
    expect(element.querySelector('.resource-card.selected')).toBeNull();
    expect(component.isGroupExpanded('group')).toBeTrue();

    element.querySelector<HTMLButtonElement>('.resource-group-header')!.click();
    fixture.detectChanges();
    expect(component.isGroupExpanded('group')).toBeFalse();
  });
});
