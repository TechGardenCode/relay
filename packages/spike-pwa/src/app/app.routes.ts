import type { Routes } from '@angular/router';

import { authGuard } from './auth/auth.guard';

export const APP_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'sessions' },
  {
    path: 'pair',
    loadComponent: async () => (await import('./pair/pair.component')).PairComponent,
  },
  {
    path: 'sessions',
    canActivate: [authGuard],
    loadComponent: async () =>
      (await import('./sessions-list/sessions-list.component')).SessionsListComponent,
  },
  {
    path: 'sessions/:id',
    canActivate: [authGuard],
    loadComponent: async () =>
      (await import('./live-session/live-session.component')).LiveSessionComponent,
  },
  { path: '**', redirectTo: 'sessions' },
];
