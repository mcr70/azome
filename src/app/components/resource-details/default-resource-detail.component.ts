import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResourceDetailItem } from '../../services/azome/resource-detail.registry';

@Component({
  selector: 'app-default-resource-detail',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="json-properties" *ngIf="resource?.properties">
      <h3>Properties (Raw)</h3>
      <pre>{{ resource.properties | json }}</pre>
    </div>
  `,
  styles: [`
    h3 { font-size: 0.875rem; color: #475569; text-transform: uppercase; margin-bottom: 8px; }
    pre { background: #0f172a; color: #38bdf8; padding: 12px; border-radius: 6px; font-size: 0.75rem; overflow-x: auto; }
  `]
})
export class DefaultResourceDetailComponent implements ResourceDetailItem {
  @Input() resource: any;
}