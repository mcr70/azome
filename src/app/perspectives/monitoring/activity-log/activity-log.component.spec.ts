import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ResourceSelectionService } from '@services/azome/resource-selection.service';
import { ActivityLogEvent } from '@services/azure/monitoring.service';
import { ActivityLogComponent } from './activity-log.component';

describe('ActivityLogComponent resource selection', () => {
  let fixture: ComponentFixture<ActivityLogComponent>;
  const event: ActivityLogEvent = {
    id: 'event-id',
    eventTimestamp: '2026-10-20T00:00:00Z',
    resourceId: '/subscriptions/test/resourceGroups/group/providers/Microsoft.Web/sites/app',
    operationName: { localizedValue: 'Update app' }
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ActivityLogComponent] }).compileComponents();
    fixture = TestBed.createComponent(ActivityLogComponent);
    fixture.componentRef.setInput('events', [event]);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('always offers resource selection without opening event details', () => {
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector('.selection-cell input');
    expect(checkbox).not.toBeNull();
    checkbox.click();
    fixture.detectChanges();
    const selection = TestBed.inject(ResourceSelectionService);
    expect(selection.isSelected(event.resourceId!)).toBeTrue();
    expect(fixture.componentInstance.selectedEvent).toBeNull();
    checkbox.click();
    expect(selection.selectedResources).toEqual([]);
  });

  it('keeps opening event details from the row and disables selection for events without resources', () => {
    fixture.componentRef.setInput('events', [{ ...event, resourceId: undefined }]);
    fixture.detectChanges();
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector('.selection-cell input');
    expect(checkbox.disabled).toBeTrue();
    const openDetails = spyOn(fixture.componentInstance, 'openDetails');
    fixture.nativeElement.querySelector('.activity-row').click();
    expect(openDetails).toHaveBeenCalled();
  });
});
