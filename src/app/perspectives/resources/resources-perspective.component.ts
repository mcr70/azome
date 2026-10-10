import { Component } from '@angular/core';
import { ResourceGroupListComponent } from './resource-group-list.component';
import { ResourceSelectionBarComponent } from '../../components/resource-selection-bar.component';

@Component({
  selector: 'app-resources-perspective',
  standalone: true,
  imports: [ResourceGroupListComponent, ResourceSelectionBarComponent],
  templateUrl: './resources-perspective.component.html',
  styleUrl: './resources-perspective.component.scss'
})
export class ResourcesPerspectiveComponent {}
