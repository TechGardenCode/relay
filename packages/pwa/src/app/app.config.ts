import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding binds the :id route param to LiveSessionComponent's
    // `id` input (app-shell.md §4.1).
    provideRouter(routes, withComponentInputBinding()),
    // Per NFR-7 (app-shell.md §3): the service worker exists for installability
    // + first-load app-shell caching ONLY — never session data. The PWA is a
    // live view; disconnected is a reconnect prompt, not an offline mode.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
