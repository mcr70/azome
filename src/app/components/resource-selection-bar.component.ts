import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResourceSelectionService } from '../services/azome/resource-selection.service';

@Component({
  selector: 'app-resource-selection-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './resource-selection-bar.component.html',
  styleUrl: './resource-selection-bar.component.scss'
})
export class ResourceSelectionBarComponent {
  constructor(public selection: ResourceSelectionService) {}

  public clearSelection(): void {
    this.selection.clear();
  }
}
