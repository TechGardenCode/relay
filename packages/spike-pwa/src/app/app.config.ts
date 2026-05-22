import { provideHttpClient, withInterceptors } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import { provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { authInterceptor } from './auth/auth.interceptor';
import { APP_ROUTES } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // HTML5 PathLocation routing; the Relay server's static-serve route
    // rewrites any unmatched /app/* path to index.html so deep-link
    // refreshes (e.g., /app/sessions/abc) work after page reload.
    provideRouter(APP_ROUTES),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
