import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PolicyParametersTableComponent } from './policy-parameters-table.component';

@Component({
  selector: 'app-policy-definition-detail',
  standalone: true,
  imports: [CommonModule, PolicyParametersTableComponent],
  templateUrl: './policy-definition.component.html',
  styleUrl: './policy-definition.component.scss'
})
export class PolicyDefinitionDetailComponent {
  // Input signal for the policy definition object
  public readonly policy = signal<any | null>(null);

  @Input({ required: true })
  set policyData(value: any) {
    this.policy.set(value);
  }

}
