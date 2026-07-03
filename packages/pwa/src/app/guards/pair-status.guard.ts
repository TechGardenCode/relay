import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

// Per app-shell.md §4.5: a single guard gates every route except /pair. Any
// unauthenticated navigation is bounced to /pair. Purely client-side state
// (NFR-5 — no server coupling).
export const pairStatusGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.pairStatus() === 'paired' ? true : router.createUrlTree(['/pair']);
};
