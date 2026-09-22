import { Component } from '@angular/core';
import { ResourceGroupListComponent } from './resource-group-list.component';

@Component({
  selector: 'app-resources-perspective',
  standalone: true,
  imports: [ResourceGroupListComponent],
  templateUrl: './resources-perspective.component.html',
  styleUrl: './resources-perspective.component.scss'
})
export class ResourcesPerspectiveComponent {}