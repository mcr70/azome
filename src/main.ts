import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { loadRuntimeConfig } from './app/config/runtime-config';

loadRuntimeConfig()
  .then(() => bootstrapApplication(AppComponent, appConfig))
  .catch((error: unknown) => {
    console.error('Azome startup failed:', error);

    const root = document.querySelector('app-root');
    if (root) {
      const message = error instanceof Error ? error.message : String(error);
      root.setAttribute('role', 'alert');
      root.textContent = `Azome could not start: ${message}`;
    }
  });