import { Component } from '@angular/core';

@Component({
  selector: 'app-networking-perspective',
  standalone: true,
  template: `
    <section class="networking-perspective" aria-labelledby="networking-title">
      <p class="eyebrow">Perspective</p>
      <h1 id="networking-title">Networking</h1>
      <p>Explore the network topology, connections, and security boundaries across this subscription.</p>
    </section>
  `,
  styles: `
    .networking-perspective {
      max-width: 960px;
      padding: 32px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #ffffff;
      color: #172033;
    }

    .eyebrow {
      margin: 0 0 8px;
      color: #0f766e;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      font-size: 1.5rem;
    }

    p:last-child {
      max-width: 560px;
      margin: 12px 0 0;
      color: #475569;
      line-height: 1.5;
    }
  `
})
export class NetworkingPerspectiveComponent {}
