/** Verifies Policy Set modal loading, metadata rendering, pagination states, and close behavior. */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GovernanceService } from '@services/azure/governance.service';
import { Subject, of } from 'rxjs';
import { PolicySetDetailsDialogComponent } from './policy-set-details-dialog.component';
import { PolicySetDetailsDialogService } from './policy-set-details-dialog.service';

describe('PolicySetDetailsDialogComponent', () => {
  let fixture: ComponentFixture<PolicySetDetailsDialogComponent>;
  let dialogState: PolicySetDetailsDialogService;
  let getPolicyJson: jasmine.Spy;
  let getPolicyDefinitionDisplayNames: jasmine.Spy;

  beforeEach(async () => {
    getPolicyJson = jasmine.createSpy('getPolicyJson');
    getPolicyDefinitionDisplayNames = jasmine.createSpy('getPolicyDefinitionDisplayNames')
      .and.returnValue(of({}));
    await TestBed.configureTestingModule({
      imports: [PolicySetDetailsDialogComponent],
      providers: [
        PolicySetDetailsDialogService,
        {
          provide: GovernanceService,
          useValue: { getPolicyJson, getPolicyDefinitionDisplayNames }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PolicySetDetailsDialogComponent);
    dialogState = TestBed.inject(PolicySetDetailsDialogService);
  });

  afterEach(() => {
    dialogState.close();
  });

  it('loads the selected Policy Set and renders its metadata and membership references', () => {
    const policySetId = '/providers/Microsoft.Authorization/policySetDefinitions/baseline';
    const definitionId = '/providers/Microsoft.Authorization/policyDefinitions/check-https';
    getPolicyJson.and.returnValue(of({
      id: policySetId,
      name: 'baseline',
      properties: {
        displayName: 'Production baseline',
        description: 'Production security requirements.',
        policyType: 'Custom',
        version: '2.1.0',
        parameters: { effect: { type: 'String', defaultValue: 'Audit' } },
        policyDefinitions: [{
          policyDefinitionId: definitionId,
          policyDefinitionReferenceId: 'RequireHttps',
          definitionVersion: '1.0.0',
          parameters: { effect: { value: 'Audit' } }
        }]
      }
    }));
    getPolicyDefinitionDisplayNames.and.returnValue(of({
      [definitionId.toLowerCase()]: 'Require HTTPS for storage accounts'
    }));

    dialogState.open(policySetId);
    fixture.detectChanges();

    expect(getPolicyJson).toHaveBeenCalledOnceWith(policySetId);
    expect(getPolicyDefinitionDisplayNames).toHaveBeenCalledOnceWith([definitionId]);
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('dialog')?.open).toBeTrue();
    expect(element.textContent).toContain('Production baseline');
    expect(element.textContent).toContain('Custom');
    expect(element.textContent).toContain('2.1.0');
    expect(element.textContent).toContain('RequireHttps');
    expect(element.textContent).toContain('Require HTTPS for storage accounts');
    expect(element.textContent).toContain('check-https');
    expect(element.textContent).toContain('Audit');
  });

  it('searches every member field, resets pagination, and sorts the filtered data', () => {
    const members = Array.from({ length: 216 }, (_, index) => ({
      policyDefinitionId: `/providers/Microsoft.Authorization/policyDefinitions/member-${index}`,
      policyDefinitionReferenceId: `Reference-${index}`,
      definitionVersion: '1.0.0',
      parameters: index === 201 ? { effect: { value: 'Deny' } } : {}
    }));
    const names = Object.fromEntries(members.map((member, index) => [
      member.policyDefinitionId.toLowerCase(),
      `Policy ${String(index).padStart(3, '0')}`
    ]));
    getPolicyJson.and.returnValue(of({ properties: { policyDefinitions: members } }));
    getPolicyDefinitionDisplayNames.and.returnValue(of(names));

    dialogState.open('/providers/Microsoft.Authorization/policySetDefinitions/large');
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelectorAll('.definitions-table tbody tr').length).toBe(25);
    expect(element.textContent).toContain('Page 1 of 9');
    element.querySelector<HTMLButtonElement>('.pagination button:last-child')?.click();
    fixture.detectChanges();
    expect(element.textContent).toContain('Page 2 of 9');

    const search = element.querySelector<HTMLInputElement>('.definition-filter input')!;
    search.value = 'Policy 201';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(element.querySelectorAll('.definitions-table tbody tr').length).toBe(1);
    expect(element.textContent).toContain('Reference-201');
    expect(element.textContent).toContain('Page 1 of 1');

    search.value = 'member-201';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(element.querySelectorAll('.definitions-table tbody tr').length).toBe(1);

    search.value = 'reference-201';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(element.querySelectorAll('.definitions-table tbody tr').length).toBe(1);

    search.value = 'deny';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(element.querySelectorAll('.definitions-table tbody tr').length).toBe(1);

    element.querySelector<HTMLButtonElement>('.clear-filter-button')?.click();
    fixture.detectChanges();
    expect(element.querySelectorAll('.definitions-table tbody tr').length).toBe(25);
    expect(element.textContent).toContain('Page 1 of 9');

    element.querySelector<HTMLButtonElement>('.sort-button')?.click();
    fixture.detectChanges();
    expect(element.querySelector('tbody tr')?.textContent).toContain('Policy 215');
  });

  it('shows a loading state and renders an API error', () => {
    const response = new Subject<unknown>();
    getPolicyJson.and.returnValue(response);

    dialogState.open('/providers/Microsoft.Authorization/policySetDefinitions/locked');
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Loading Policy Set details');
    response.error(new Error('Forbidden'));
    fixture.detectChanges();
    expect(element.textContent).toContain('Policy Set details could not be loaded');
  });

  it('shows an empty state when the Policy Set has no member definitions', () => {
    getPolicyJson.and.returnValue(of({
      id: '/providers/Microsoft.Authorization/policySetDefinitions/empty',
      properties: { policyDefinitions: [] }
    }));

    dialogState.open('/providers/Microsoft.Authorization/policySetDefinitions/empty');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent)
      .toContain('This Policy Set contains no Policy Definitions.');
  });

  it('rejects an empty Policy Set reference and closes without losing the launcher state', () => {
    expect(dialogState.open('')).toBeFalse();
    expect(dialogState.policySetId()).toBeNull();

    getPolicyJson.and.returnValue(of({ id: 'policy-set-id', properties: {} }));
    dialogState.open('policy-set-id');
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    element.querySelector<HTMLButtonElement>('.close-button')?.click();
    fixture.detectChanges();

    expect(dialogState.policySetId()).toBeNull();
    expect(fixture.nativeElement.querySelector('dialog')?.open).toBeFalse();
  });
});
