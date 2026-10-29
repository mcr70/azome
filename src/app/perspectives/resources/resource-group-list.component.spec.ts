import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ResourceGroupListComponent } from './resource-group-list.component';
import { ResourceSelectionService } from '@services/azome/resource-selection.service';

describe('ResourceGroupListComponent', () => {
  let component: ResourceGroupListComponent;
  let fixture: ComponentFixture<ResourceGroupListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, ResourceGroupListComponent],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ResourceGroupListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('links each resource card to its metrics deep link', () => {
    const resource = {
      id: '/subscriptions/test/resourceGroups/apps/providers/Microsoft.Web/sites/orders',
      name: 'orders',
      type: 'Microsoft.Web/sites'
    };
    component.loading = false;
    component.resourceGroups = [{ id: 'group', name: 'apps', location: 'westeurope' }];
    component.groupResources = { apps: [resource] };
    component.expandedGroups.add('apps');
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('.resource-action') as HTMLAnchorElement;
    const target = new URL(link.getAttribute('href')!, 'http://localhost');

    expect(target.pathname).toBe('/monitoring/metrics');
    expect(target.searchParams.get('resourceId')).toBe(resource.id);
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
