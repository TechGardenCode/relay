import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { TokenStore } from './token.store';

export const authGuard: CanActivateFn = () => {
  const tokenStore = inject(TokenStore);
  const router = inject(Router);
  if (tokenStore.isPaired()) return true;
  return router.createUrlTree(['/pair']);
};
