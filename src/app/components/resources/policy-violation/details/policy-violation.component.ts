/** Displays policy evaluation metadata for a non-compliant resource. */
import { Component, Input } from '@angular/core';
import { PanelVariant, ResourceDetailItem } from '@services/azome/resource-detail.registry';

interface PolicyViolationProperties {
  resourceId?: string;
  policyDefinitionName?: string;
  policyDefinitionId?: string;
  complianceState?: string;
  policyAssignmentName?: string;
  policyAssignmentId?: string;
  timestamp?: string;
}

interface PolicyViolationResource {
  id?: string;
  name?: string;
  properties?: PolicyViolationProperties;
}

/** Shows the affected resource and policy identifiers for a violation. */
@Component({
  selector: 'app-policy-violation-detail',
  standalone: true,
  imports: [],
  templateUrl: './policy-violation.component.html',
  styleUrl: './policy-violation.component.scss'
})
export class PolicyViolationDetailComponent implements ResourceDetailItem {
  static readonly preferredVariant: PanelVariant = 'content';

  @Input() resource: PolicyViolationResource | null = null;

  /** Returns policy evaluation properties when the selected resource includes them. */
  public get properties(): PolicyViolationProperties | undefined {
    return this.resource?.properties;
  }
}
