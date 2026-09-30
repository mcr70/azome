import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResourceDetailItem } from '../../services/azome/resource-detail.registry';

@Component({
  selector: 'app-default-resource-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './default-resource-detail.component.html',
  styleUrl: './default-resource-detail.component.scss'
})
export class DefaultResourceDetailComponent implements ResourceDetailItem {
  @Input() resource: any;
}