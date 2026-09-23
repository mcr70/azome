import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PanelVariant, ResourceDetailItem } from '../../services/azome/resource-detail.registry';

@Component({
  selector: 'app-route-table-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './route-table.component.html',
  styleUrl: './route-table.component.scss'
})
export class RouteTableComponent implements ResourceDetailItem {
  @Input() resource: any;
  static readonly preferredVariant: PanelVariant = 'content';
  
  get routes(): any[] {
    return this.resource?.properties?.routes || [];
  }
}