import { Component } from '@angular/core';
import { ResourceGroupListComponent } from './resource-group-list.component';

@Component({
  selector: 'app-resources-perspective',
  standalone: true,
  imports: [ResourceGroupListComponent],
  template: `
    <section aria-labelledby="resources-title">
      <p class="eyebrow">Perspective</p>
      <h1 id="resources-title">Resources</h1>
      <app-resource-group-list />
    </section>
  `,
  styles: `
    .eyebrow {
      margin: 0 0 8px;
      color: #0f766e;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    h1 {
      margin: 0 0 20px;
      color: #172033;
      font-size: 1.5rem;
    }
  `
})
export class ResourcesPerspectiveComponent {}
