import { GovernancePolicySummary } from '@services/azure/governance.service';
import { TestBed } from '@angular/core/testing';
import { GovernancePolicyCardComponent } from './governance-cards.component';

describe('GovernancePolicyCardComponent grouping', () => {
  let component: GovernancePolicyCardComponent;

  const firstResource = '/subscriptions/subscription/resourceGroups/rg/providers'
    + '/Microsoft.Compute/virtualMachines/vm-1';
  const secondResource = '/subscriptions/subscription/resourceGroups/rg/providers'
    + '/Microsoft.Compute/virtualMachines/vm-2';

  const makeViolation = (
    resource: string,
    policy: string,
    policyDefinitionId: string
  ): GovernancePolicySummary['violations'][number] => ({
    resource,
    policy,
    policyDefinitionId,
    state: 'NonCompliant',
    policySetDefinitionName: 'Microsoft cloud security benchmark',
    policySetDefinitionId: '/providers/Microsoft.Authorization/policySetDefinitions/benchmark'
  });

  beforeEach(() => {
    component = new GovernancePolicyCardComponent();
    component.data = {
      compliant: 0,
      nonCompliant: 3,
      violations: [
        makeViolation(firstResource, 'Require secure settings', 'policy-1'),
        makeViolation(secondResource, 'Require secure settings', 'policy-1'),
        makeViolation(firstResource, 'Enable Defender', 'policy-2')
      ],
      policySets: [{
        id: '/providers/Microsoft.Authorization/policySetDefinitions/benchmark',
        name: 'Microsoft cloud security benchmark'
      }],
      pageIndex: 0,
      pageSize: 30,
      filters: {}
    };
  });

  it('shows the policy set next to the violated policy heading', () => {
    component.setGrouping('violation');
    const groups = component.groupedViolations;
    expect(groups[0].label).toBe('Require secure settings');
    expect(groups[0].policySetName).toBe('Microsoft cloud security benchmark');
    expect(groups[0].violations.map((violation) => violation.resource))
      .toEqual([firstResource, secondResource]);
  });

  it('groups violations by policy and lists each affected resource once', () => {
    component.setGrouping('violation');

    const groups = component.groupedViolations;
    expect(groups.length).toBe(2);
    expect(groups[0].label).toBe('Require secure settings');
    expect(groups[0].violations.map((violation) => violation.resource))
      .toEqual([firstResource, secondResource]);
  });

  it('opens a resource detail with all violations in that resource group', () => {
    const emit = spyOn(component.resourceSelected, 'emit');
    const resourceGroup = component.groupedViolations.find((group) =>
      group.violations[0].resource === firstResource
    );

    component.selectResourceViolations(resourceGroup?.violations ?? []);

    expect(emit).toHaveBeenCalled();
    const selectedResource = emit.calls.mostRecent().args[0]!;
    expect(selectedResource.id).toBe(firstResource);
    expect(selectedResource.properties['policyViolations']).toEqual([
      jasmine.objectContaining({ policyDefinitionName: 'Require secure settings' }),
      jasmine.objectContaining({ policyDefinitionName: 'Enable Defender' })
    ]);
  });

  it('passes all resource violations when the Resource row is clicked', async () => {
    await TestBed.configureTestingModule({
      imports: [GovernancePolicyCardComponent]
    }).compileComponents();
    const fixture = TestBed.createComponent(GovernancePolicyCardComponent);
    fixture.componentRef.setInput('data', component.data);
    const emit = spyOn(fixture.componentInstance.resourceSelected, 'emit');
    fixture.detectChanges();

    const resourceButton = fixture.nativeElement.querySelector('.resource-link') as HTMLButtonElement;
    resourceButton.click();

    expect(emit).toHaveBeenCalled();
    const selectedResource = emit.calls.mostRecent().args[0]!;
    expect(selectedResource.properties['policyViolations']).toHaveSize(2);
  });
});