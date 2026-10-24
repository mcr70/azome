/** Verifies that policy set references launch a separate dialog without removing the violation. */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GovernanceService } from '@services/azure/governance.service';
import { of } from 'rxjs';
import { PolicySetDetailsDialogComponent } from './policy-set-details-dialog.component';
import { PolicySetDetailsDialogService } from './policy-set-details-dialog.service';
import { PolicyViolationDetailComponent } from './policy-violation.component';

describe('PolicyViolationDetailComponent Policy Set dialog integration', () => {
  let fixture: ComponentFixture<PolicyViolationDetailComponent>;
  let dialogFixture: ComponentFixture<PolicySetDetailsDialogComponent>;
  let dialogState: PolicySetDetailsDialogService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PolicyViolationDetailComponent, PolicySetDetailsDialogComponent],
      providers: [{
        provide: GovernanceService,
        useValue: { getPolicyJson: () => of({ id: 'policy-definition-id' }) }
      }]
    }).compileComponents();

    fixture = TestBed.createComponent(PolicyViolationDetailComponent);
    dialogFixture = TestBed.createComponent(PolicySetDetailsDialogComponent);
    dialogState = TestBed.inject(PolicySetDetailsDialogService);
  });

  afterEach(() => {
    dialogState.close();
  });

  it('opens a standalone Policy Set dialog using the definition ID and keeps the violation mounted', () => {
    const policySetId = '/providers/Microsoft.Authorization/policySetDefinitions/secure-baseline';
    fixture.componentRef.setInput('resource', {
      id: '/subscriptions/subscription-id/resourceGroups/prod/providers/Microsoft.Storage/storageAccounts/data',
      properties: {
        policyDefinitionId: 'policy-definition-id',
        policySetDefinitionId: policySetId,
        policySetDefinitionName: 'Secure baseline'
      }
    });
    fixture.detectChanges();

    const violationElement: HTMLElement = fixture.nativeElement;
    violationElement.querySelector<HTMLButtonElement>('.policy-set-link')?.click();

    expect(dialogState.policySetId()).toBe(policySetId);
    expect(violationElement.querySelector('.policy-violation-detail')).not.toBeNull();
    expect(violationElement.textContent).toContain('Secure baseline');
    dialogFixture.detectChanges();
    const dialogElement: HTMLElement = dialogFixture.nativeElement;
    expect(dialogElement.querySelector('dialog')?.open).toBeTrue();

    dialogElement.querySelector<HTMLButtonElement>('.close-button')?.click();
    dialogFixture.detectChanges();

    expect(dialogState.policySetId()).toBeNull();
    expect(violationElement.querySelector('.policy-violation-detail')).not.toBeNull();
  });

  it('renders an unavailable Policy Set reference as non-interactive text when its ID is missing', () => {
    fixture.componentRef.setInput('resource', {
      properties: { policySetDefinitionName: 'Unavailable definition' }
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.policy-set-link')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Unavailable definition');
    expect(dialogState.policySetId()).toBeNull();
  });
});
