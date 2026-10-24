/** Verifies the shared Policy parameter table formatting and empty state. */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PolicyParametersTableComponent } from './policy-parameters-table.component';

describe('PolicyParametersTableComponent', () => {
  let fixture: ComponentFixture<PolicyParametersTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PolicyParametersTableComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(PolicyParametersTableComponent);
  });

  it('renders parameter metadata and structured values', () => {
    fixture.componentInstance.parameters = {
      effect: {
        type: 'String',
        metadata: {
          displayName: 'Policy effect',
          description: 'Effect applied when the policy evaluates a resource.'
        },
        defaultValue: 'Audit',
        allowedValues: ['Audit', 'Deny']
      },
      enabled: {
        type: 'Boolean',
        defaultValue: false
      }
    };
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Policy effect');
    expect(element.textContent).toContain('effect');
    expect(element.textContent).toContain('String');
    expect(element.textContent).toContain('Audit');
    expect(element.textContent).toContain('[\n  "Audit",\n  "Deny"\n]');
    expect(element.textContent).toContain('false');
    expect(element.textContent)
      .toContain('Effect applied when the policy evaluates a resource.');
  });

  it('shows a clear empty state when the definition has no parameters', () => {
    fixture.componentInstance.parameters = {};
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No parameters are defined.');
  });
});
