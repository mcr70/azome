import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import {
  ResourceDetailPanelService,
  ResourcePanelConfig
} from '@services/azome/resource-detail-panel.service';
import { ResourceGroupListComponent } from './resource-group-list.component';
import { ResourcesPerspectiveComponent } from './resources-perspective.component';

describe('ResourcesPerspectiveComponent', () => {
  let fixture: ComponentFixture<ResourcesPerspectiveComponent>;
  let element: HTMLElement;
  let panels$: BehaviorSubject<ResourcePanelConfig[]>;
  let panelService: jasmine.SpyObj<ResourceDetailPanelService>;
  const panel: ResourcePanelConfig = {
    id: 'panel-1',
    pinned: true,
    createdAt: Date.now(),
    resource: {
      id: '/subscriptions/test/resourceGroups/apps/providers/Microsoft.Web/sites/orders',
      name: 'orders',
      type: 'Microsoft.Web/sites'
    }
  };

  beforeEach(async () => {
    panels$ = new BehaviorSubject<ResourcePanelConfig[]>([]);
    panelService = jasmine.createSpyObj<ResourceDetailPanelService>(
      'ResourceDetailPanelService',
      ['openPanel', 'closePanel', 'togglePin'],
      { panels$ }
    );

    await TestBed.configureTestingModule({
      imports: [ResourcesPerspectiveComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ResourceDetailPanelService, useValue: panelService }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(ResourcesPerspectiveComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('uses the shared perspective layout with the heading in the main content column', () => {
    const mainContent = element.querySelector('.perspective-main-content');

    expect(element.querySelector('.perspective-root')).not.toBeNull();
    expect(mainContent?.querySelector('.perspective-heading h1')?.textContent)
      .toContain('Resources');
    expect(mainContent?.querySelector('.perspective-actions app-resource-selection-bar'))
      .not.toBeNull();
    expect(mainContent?.querySelector('app-resource-group-list')).not.toBeNull();
  });

  it('places Refresh next to the selection bar and delegates it to the group list', () => {
    const actions = element.querySelector<HTMLElement>('.perspective-actions')!;
    const summary = actions.querySelector('app-resource-selection-bar');
    const refresh = actions.querySelector<HTMLButtonElement>('.refresh-button')!;
    expect(summary!.nextElementSibling).toBe(refresh);

    // The button is disabled while the list is still loading its groups.
    expect(refresh.disabled).toBeTrue();

    const list = fixture.debugElement.query(By.directive(ResourceGroupListComponent))
      .componentInstance as ResourceGroupListComponent;
    const refreshSpy = spyOn(list, 'refresh');
    list.loadingChange.emit(false);
    fixture.detectChanges();

    expect(refresh.disabled).toBeFalse();
    refresh.click();
    expect(refreshSpy).toHaveBeenCalled();
  });

  it('shows a pinned panel beside the content and delegates panel actions', () => {
    panels$.next([panel]);
    fixture.detectChanges();

    const layout = element.querySelector('.perspective-workspace-layout')!;
    expect(layout.classList).toContain('has-one-pinned-panel');
    expect(element.querySelector('.pinned-panel-slots app-resource-detail-pane')).not.toBeNull();

    fixture.componentInstance.closePanel(panel.id);
    fixture.componentInstance.togglePanelPin(panel.id);
    expect(panelService.closePanel).toHaveBeenCalledWith(panel.id);
    expect(panelService.togglePin).toHaveBeenCalledWith(panel.id);
  });

  it('renders a floating panel outside the pinned slots', () => {
    panels$.next([{ ...panel, pinned: false }]);
    fixture.detectChanges();

    expect(element.querySelector('.pinned-panel-slots')).toBeNull();
    expect(element.querySelector('app-resource-detail-pane')).not.toBeNull();
    expect(element.querySelector('.perspective-workspace-layout')!.classList)
      .not.toContain('has-one-pinned-panel');
  });
});
