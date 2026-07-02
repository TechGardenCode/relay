import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Per NFR-7 (app-shell.md §3): the service worker exists for installability
    // + first-load app-shell caching ONLY — never session data. The PWA is a
    // live view; disconnected is a reconnect prompt, not an offline mode.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
