import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, Subject, throwError } from 'rxjs';
import { ResourceCardComponent } from '@components/resource-card/resource-card.component';
import { ResourceSelectionBarComponent } from '@components/resource-selection-bar.component';
import { ResourceSelectionService } from '@services/azome/resource-selection.service';
import { ResourceDetailPanelService } from '@services/azome/resource-detail-panel.service';
import {
  AzureAppResource,
  AzureTaggedAppResource,
  ResourceGraphService
} from '@services/azure/resource-graph.service';
import { AppPerspectiveComponent } from './app-perspective.component';

describe('AppPerspectiveComponent', () => {
  let fixture: ComponentFixture<AppPerspectiveComponent>;
  let component: AppPerspectiveComponent;
  let element: HTMLElement;
  let graph: jasmine.SpyObj<ResourceGraphService>;
  let panels: jasmine.SpyObj<ResourceDetailPanelService>;
  const functionResource: AzureAppResource = {
    id: 'function-id',
    name: 'orders-function',
    resourceGroup: 'production',
    type: 'microsoft.web/sites',
    category: 'Serverless',
    kind: 'functionapp'
  };
  const taggedFunction: AzureTaggedAppResource = {
    ...functionResource,
    tags: { 'azome-apps': ' Orders, Reporting, Orders, , ' }
  };
  const cosmos: AzureTaggedAppResource = {
    id: 'cosmos-id',
    name: 'orders-cosmos',
    resourceGroup: 'production',
    type: 'microsoft.documentdb/databaseaccounts',
    tags: { 'azome-apps': 'Orders' }
  };

  beforeEach(async () => {
    graph = jasmine.createSpyObj<ResourceGraphService>(
      'ResourceGraphService',
      ['getApplicationResources', 'getTaggedApplicationResources', 'getResourceDetails']
    );
    graph.getApplicationResources.and.returnValue(of([functionResource]));
    graph.getTaggedApplicationResources.and.returnValue(of([taggedFunction, cosmos]));
    graph.getResourceDetails.and.returnValue(of(cosmos));
    panels = jasmine.createSpyObj<ResourceDetailPanelService>(
      'ResourceDetailPanelService',
      ['openPanel', 'closePanel', 'togglePin'],
      { panels$: of([]) }
    );

    await TestBed.configureTestingModule({
      imports: [AppPerspectiveComponent],
      providers: [
        { provide: ResourceGraphService, useValue: graph },
        { provide: ResourceDetailPanelService, useValue: panels }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(AppPerspectiveComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('defaults to categories and places both tabs below the filter', () => {
    expect(component.activeTab).toBe('categories');
    expect(graph.getTaggedApplicationResources).not.toHaveBeenCalled();
    const filter = element.querySelector('app-text-filter');
    const tabs = element.querySelector('[role="tablist"]');
    expect(filter).not.toBeNull();
    expect(tabs).not.toBeNull();
    expect(filter!.compareDocumentPosition(tabs!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(element.querySelector('#categories-tab')?.getAttribute('aria-selected')).toBe('true');
    expect(element.querySelector('#categories-panel h2')?.textContent).toContain('Serverless');
  });

  it('keeps selection next to Refresh without moving the filter when selection changes', () => {
    const actions = element.querySelector<HTMLElement>('.perspective-actions')!;
    const summary = actions.querySelector('app-resource-selection-bar');
    const refresh = actions.querySelector('.refresh-button');
    expect(summary).not.toBeNull();
    expect(refresh).not.toBeNull();
    expect(summary!.nextElementSibling).toBe(refresh);

    const filter = element.querySelector<HTMLElement>('app-text-filter')!;
    const initialTop = filter.getBoundingClientRect().top;
    const selection = TestBed.inject(ResourceSelectionService);
    for (let index = 0; index < 20; index++) {
      selection.select({
        id: `resource-${index}`,
        name: `long-resource-name-${index}`,
        type: 'test/resource',
        resourceGroup: 'production'
      });
    }
    fixture.detectChanges();
    expect(filter.getBoundingClientRect().top).toBe(initialTop);
    expect(actions.getBoundingClientRect().height).toBe(50);
    expect(actions.querySelector('.selected-resource-list')).toBeNull();
    expect(actions.querySelector('.selection-count')?.textContent).toBe('20');

    actions.querySelector<HTMLButtonElement>('.selection-summary')!.click();
    fixture.detectChanges();
    expect(filter.getBoundingClientRect().top).toBe(initialTop);
    expect(actions.getBoundingClientRect().height).toBe(50);

    selection.clear();
    fixture.detectChanges();
    expect(filter.getBoundingClientRect().top).toBe(initialTop);
  });

  it('trims app names, ignores empty names and deduplicates membership within each app', () => {
    component.selectTab('apps');
    expect(component.appGroups).toEqual([
      { name: 'Orders', resources: [taggedFunction, cosmos] },
      { name: 'Reporting', resources: [taggedFunction] }
    ]);
  });

  it('keeps the heading actions inside a narrow content area when resources are selected', () => {
    const content = element.querySelector<HTMLElement>('.app-main-content')!;
    content.style.width = '360px';
    const filter = element.querySelector<HTMLElement>('app-text-filter')!;
    const initialTop = filter.getBoundingClientRect().top;
    TestBed.inject(ResourceSelectionService).select({
      id: 'resource-id',
      name: 'a-very-long-selected-resource-name',
      type: 'test/resource',
      resourceGroup: 'production'
    });
    fixture.detectChanges();

    const actions = element.querySelector<HTMLElement>('.perspective-actions')!;
    expect(actions.scrollWidth).toBeLessThanOrEqual(actions.clientWidth);
    expect(filter.getBoundingClientRect().top).toBe(initialTop);
  });

  it('filters by app name, member name and resource group with exclusions', () => {
    component.selectTab('apps');
    component.filterQuery = 'orders !function';
    expect(component.appGroups).toEqual([{ name: 'Orders', resources: [cosmos] }]);
    component.filterQuery = 'reporting production';
    expect(component.appGroups).toEqual([{ name: 'Reporting', resources: [taggedFunction] }]);
    component.filterQuery = '!reporting';
    expect(component.appGroups).toEqual([{ name: 'Orders', resources: [taggedFunction, cosmos] }]);
    component.filterQuery = 'missing';
    expect(component.appGroups).toEqual([]);
  });

  it('preserves the filter across tabs and refreshes only the active dataset', () => {
    component.filterQuery = 'orders';
    component.selectTab('apps');
    component.loadResources();
    expect(graph.getApplicationResources).toHaveBeenCalledTimes(1);
    expect(graph.getTaggedApplicationResources).toHaveBeenCalledTimes(2);
    component.selectTab('categories');
    expect(component.filterQuery).toBe('orders');
    expect(component.filteredResources).toEqual([functionResource]);
    expect(graph.getApplicationResources).toHaveBeenCalledTimes(2);
  });

  it('renders separate app boxes with selectable cards, unique IDs and working details', () => {
    element.querySelector<HTMLButtonElement>('#apps-tab')!.click();
    fixture.detectChanges();
    expect(element.querySelector('#apps-tab')?.getAttribute('aria-selected')).toBe('true');
    expect(element.querySelectorAll('#apps-panel .category-section').length).toBe(2);
    expect(element.querySelectorAll('#categories-panel app-resource-card').length).toBe(0);
    const cards = fixture.debugElement.queryAll(By.directive(ResourceCardComponent));
    expect(cards.length).toBe(3);
    const ids = Array.from(element.querySelectorAll('.resource-card'), (card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(cards.every((card) => card.componentInstance.selectable)).toBeTrue();

    const selection = TestBed.inject(ResourceSelectionService);
    element.querySelector<HTMLElement>('.resource-name')!.click();
    fixture.detectChanges();
    expect(selection.isSelected(taggedFunction.id)).toBeTrue();
    expect(element.querySelectorAll('.resource-card.selected').length).toBe(2);

    const card = element.querySelector<HTMLElement>('.resource-card')!;
    spyOn(card, 'scrollIntoView');
    const selectionBar = fixture.debugElement.query(By.directive(ResourceSelectionBarComponent))
      .componentInstance as ResourceSelectionBarComponent;
    selectionBar.scrollToResource(taggedFunction.id);
    expect(card.scrollIntoView).toHaveBeenCalled();

    element.querySelector<HTMLButtonElement>('.details-action')!.click();
    expect(graph.getResourceDetails).toHaveBeenCalledWith(taggedFunction.id);
    expect(panels.openPanel).toHaveBeenCalledWith(cosmos);
    expect(selection.isSelected(taggedFunction.id)).toBeTrue();
  });

  it('selects only visible app members and keeps selection shared across duplicate cards', () => {
    component.selectTab('apps');
    component.filterQuery = 'orders !function';
    fixture.detectChanges();
    const selection = TestBed.inject(ResourceSelectionService);
    const selectedFunction = { ...taggedFunction, resourceGroup: 'production' };
    selection.select(selectedFunction);

    const selectAll = element.querySelector<HTMLInputElement>(
      '#apps-panel .section-heading app-resource-grid-selection input'
    )!;
    selectAll.click();
    fixture.detectChanges();
    expect(selection.selectedResources.map((resource) => resource.id))
      .toEqual([taggedFunction.id, cosmos.id]);
    expect(selectAll.checked).toBeTrue();
    expect(selectAll.indeterminate).toBeFalse();

    selectAll.click();
    fixture.detectChanges();
    expect(selection.selectedResources).toEqual([selectedFunction]);
    expect(selectAll.checked).toBeFalse();
  });

  it('supports switching tabs using the keyboard', () => {
    element.querySelector('#categories-tab')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    );
    fixture.detectChanges();
    expect(component.activeTab).toBe('apps');
    expect(document.activeElement?.id).toBe('apps-tab');
    element.querySelector('#apps-tab')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
    );
    expect(component.activeTab).toBe('categories');
  });

  it('distinguishes no apps from no filter matches', () => {
    component.selectTab('apps');
    component.filterQuery = 'missing';
    fixture.detectChanges();
    expect(element.querySelector('#apps-panel .empty-state')?.textContent)
      .toContain('No apps or resources match');
    component.taggedResources = [{ ...cosmos, tags: { 'azome-apps': ' , , ' } }];
    fixture.detectChanges();
    expect(element.querySelector('#apps-panel .empty-state')?.textContent)
      .toContain('No apps were found');
  });

  it('shows query errors and allows retrying', () => {
    spyOn(console, 'error');
    graph.getTaggedApplicationResources.and.returnValue(throwError(() => new Error('Forbidden')));
    component.selectTab('apps');
    fixture.detectChanges();
    expect(component.loading).toBeFalse();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
    expect(element.querySelectorAll('#apps-panel .category-section').length).toBe(0);
    graph.getTaggedApplicationResources.and.returnValue(of([cosmos]));
    component.loadResources();
    expect(component.error).toBeNull();
    expect(component.appGroups.length).toBe(1);
  });

  it('cancels stale requests when changing tabs and on destruction', () => {
    const pending = new Subject<AzureTaggedAppResource[]>();
    graph.getTaggedApplicationResources.and.returnValue(pending);
    component.selectTab('apps');
    expect(component.loading).toBeTrue();
    component.selectTab('categories');
    pending.next([cosmos]);
    expect(component.taggedResources).toEqual([]);
    component.selectTab('apps');
    fixture.destroy();
    pending.next([cosmos]);
    expect(component.taggedResources).toEqual([]);
  });
});
