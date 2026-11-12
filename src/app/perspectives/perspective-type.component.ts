import { Component, Input } from '@angular/core';
import { AzureResource } from '@services/azure/resource-graph.service';
import { ResourceGridSelectionComponent } from '@components/resource-grid-selection/resource-grid-selection.component';

/** Shared resource type heading, selection control, and card grid wrapper. */
@Component({
  selector: 'app-perspective-type',
  standalone: true,
  imports: [ResourceGridSelectionComponent],
  templateUrl: './perspective-type.component.html',
  styleUrls: ['./perspective-type.component.scss']
})
export class PerspectiveTypeComponent {
  @Input({ required: true }) public label = '';
  @Input({ required: true }) public resources: AzureResource[] = [];
  @Input() public selectionEnabled = true;
}
