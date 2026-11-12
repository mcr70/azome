import { Component, Input } from '@angular/core';

/** Shared category heading and section wrapper for perspective resource grids. */
@Component({
  selector: 'app-perspective-category',
  standalone: true,
  templateUrl: './perspective-category.component.html',
  styleUrls: ['./perspective-category.component.scss']
})
export class PerspectiveCategoryComponent {
  @Input({ required: true }) public title = '';
  @Input({ required: true }) public kind = '';
  @Input() public resourceTypeCount = 0;
  @Input() public ariaLabel = '';
}
