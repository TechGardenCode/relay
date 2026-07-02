import { Routes } from '@angular/router';

import { LiveSessionComponent } from './components/live-session.component';
import { PairComponent } from './components/pair.component';
import { SessionsHomeComponent } from './components/sessions-home.component';
import { pairStatusGuard } from './guards/pair-status.guard';

// Per app-shell.md §4.1/§4.4: three EAGER routes (no loadComponent splits). Per
// §4.5: the pairStatus guard gates every route except /pair.
export const routes: Routes = [
  { path: 'pair', component: PairComponent },
  { path: '', component: SessionsHomeComponent, canActivate: [pairStatusGuard] },
  { path: 'sessions/:id', component: LiveSessionComponent, canActivate: [pairStatusGuard] },
  { path: '**', redirectTo: '' },
];
