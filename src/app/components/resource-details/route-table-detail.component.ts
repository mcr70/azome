import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResourceDetailItem } from '../../services/azome/resource-detail.registry';

@Component({
  selector: 'app-route-table-detail',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="routes-container">
      <h3>Routes</h3>
      
      <div *ngIf="!routes || routes.length === 0" class="empty-state">
        No routes configured in this route table.
      </div>

      <table *ngIf="routes && routes.length > 0" class="details-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Address Prefix</th>
            <th>Next Hop Type</th>
            <th>Next Hop IP</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let route of routes">
            <td><strong>{{ route.name }}</strong></td>
            <td><code>{{ route.properties?.addressPrefix }}</code></td>
            <td>{{ route.properties?.nextHopType }}</td>
            <td>{{ route.properties?.nextHopIpAddress || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    h3 { font-size: 0.875rem; color: #475569; text-transform: uppercase; margin-bottom: 12px; }
    .details-table {
      width: 100%; border-collapse: collapse; font-size: 0.8125rem;
      th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #f1f5f9; }
      th { background: #f8fafc; color: #64748b; font-weight: 600; }
      code { background: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-family: monospace; }
    }
  `]
})
export class RouteTableDetailComponent implements ResourceDetailItem {
  @Input() resource: any;

  get routes(): any[] {
    return this.resource?.properties?.routes || [];
  }
}