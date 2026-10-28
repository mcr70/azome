/** Verifies that policy set references launch a separate dialog without removing the violation. */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GovernanceService } from '@services/azure/governance.service';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
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
        useValue: {
          getPolicyJson: () => of({ id: 'policy-definition-id' }),
          getSecurityAssessment: () => of({ properties: { status: { code: 'Healthy' } } })
        }
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
  expect(violationElement.querySelector('.policy-violation-expanded')).toBeNull();
  violationElement.querySelector<HTMLButtonElement>('.policy-violation-toggle')?.click();
  fixture.detectChanges();
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

  it('renders every violation for a resource and switches the selected policy details', () => {
    fixture.componentRef.setInput('resource', {
      id: '/subscriptions/subscription-id/resourceGroups/prod/providers/Microsoft.Compute/virtualMachines/vm',
      properties: {
        resourceId: '/subscriptions/subscription-id/resourceGroups/prod/providers/Microsoft.Compute/virtualMachines/vm',
        policyViolations: [
          {
            policyDefinitionId: 'policy-one',
            policyDefinitionName: 'First violated policy',
            policySetDefinitionName: 'Security baseline',
            complianceState: 'NonCompliant'
          },
          {
            policyDefinitionId: 'policy-two',
            policyDefinitionName: 'Second violated policy',
            policySetDefinitionName: 'Security baseline',
            complianceState: 'NonCompliant'
          }
        ]
      }
    });
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const violationButtons = element.querySelectorAll('.policy-violation-toggle');
    expect(violationButtons.length).toBe(2);
    expect(element.querySelectorAll('.policy-violation-expanded').length).toBe(0);
    expect(element.textContent).toContain('First violated policy');
    expect(element.textContent).toContain('Second violated policy');

    violationButtons[1].dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    expect(element.querySelectorAll('.policy-violation-toggle.selected').length).toBe(1);
    expect(element.querySelector('.policy-violation-toggle.selected')?.textContent)
      .toContain('Second violated policy');
    expect(element.querySelectorAll('.policy-violation-expanded').length).toBe(1);

    violationButtons[0].dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    expect(element.querySelectorAll('.policy-violation-expanded').length).toBe(1);
    expect(element.querySelector('.policy-violation-toggle.selected')?.textContent)
      .toContain('First violated policy');
  });

  it('shows a mismatch when Policy Insights says NotFound but the current assessment satisfies the condition', () => {
    const governance = TestBed.inject(GovernanceService);
    spyOn(governance, 'getPolicyJson').and.returnValue(of({
      properties: {
        policyRule: {
          then: {
            details: {
              type: 'Microsoft.Security/assessments',
              name: 'assessment-id',
              existenceCondition: {
                field: 'Microsoft.Security/assessments/status.code',
                in: ['NotApplicable', 'Healthy']
              }
            }
          }
        }
      }
    }));
    const getAssessment = spyOn(governance, 'getSecurityAssessment').and.returnValue(of({
      properties: {
        status: {
          code: 'Healthy',
          statusChangeDate: '2026-10-28T06:55:10Z'
        }
      }
    }));
    const resourceId = '/subscriptions/subscription-id';
    fixture.componentRef.setInput('resource', {
      id: resourceId,
      properties: {
        resourceId,
        policyViolations: [{
          policyDefinitionId: 'owner-policy-id',
          policyDefinitionName: 'Owner limit',
          policyDefinitionAction: 'AuditIfNotExists',
          complianceState: 'NonCompliant',
          complianceReasonCode: 'NotFound'
        }]
      }
    });
    fixture.detectChanges();
    const violationButton = fixture.nativeElement.querySelector(
      '.policy-violation-toggle'
    ) as HTMLButtonElement;
    violationButton.click();
    fixture.detectChanges();

    expect(getAssessment).toHaveBeenCalledWith(resourceId, 'assessment-id');
    expect(fixture.nativeElement.textContent).toContain('NotFound');
    expect(fixture.nativeElement.querySelector('.policy-insights-warning')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Healthy');
    expect(fixture.nativeElement.textContent).toContain(
      'The current assessment satisfies this policy\'s existence condition'
    );
  });

  it('explains that a failed assessment read prevents comparing the current status', () => {
    const governance = TestBed.inject(GovernanceService);
    spyOn(governance, 'getPolicyJson').and.returnValue(of({
      properties: {
        policyRule: {
          then: {
            details: {
              type: 'Microsoft.Security/assessments',
              name: 'assessment-id',
              existenceCondition: {
                field: 'Microsoft.Security/assessments/status.code',
                in: ['NotApplicable', 'Healthy']
              }
            }
          }
        }
      }
    }));
    spyOn(governance, 'getSecurityAssessment').and.returnValue(throwError(() =>
      new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })
    ));
    fixture.componentRef.setInput('resource', {
      id: '/subscriptions/subscription-id',
      properties: {
        complianceState: 'NonCompliant',
        complianceReasonCode: 'NotFound',
        policyViolations: [{
          policyDefinitionId: 'owner-policy-id',
          policyDefinitionName: 'Owner limit',
          policyDefinitionAction: 'AuditIfNotExists',
          complianceState: 'NonCompliant',
          complianceReasonCode: 'NotFound'
        }]
      }
    });
    fixture.detectChanges();
    const violationButton = fixture.nativeElement.querySelector(
      '.policy-violation-toggle'
    ) as HTMLButtonElement;
    violationButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('HTTP 403');
    expect(fixture.nativeElement.textContent).toContain(
      'could not compare it with the assessment\'s current status'
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Microsoft.Security/assessments'
    );
  });
});
