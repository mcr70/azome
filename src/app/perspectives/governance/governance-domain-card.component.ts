/** Renders the shared accessible shell used by Governance domain cards. */
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-governance-domain-card',
  standalone: true,
  imports: [],
  templateUrl: './governance-domain-card.component.html',
  styleUrl: './governance-domain-card.component.scss'
})
export class GovernanceDomainCardComponent {
  @Input({ required: true }) title = '';
  @Input() subtitle = '';
  @Input() tone: 'default' | 'warning' | 'critical' = 'default';
  @Input() loading = false;
  @Input() loaded = true;
}
