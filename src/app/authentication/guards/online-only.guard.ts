import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OfflineUnlockService } from '../../services/auth/offline-unlock.service';

// Capture-only enforcement for offline-unlocked sessions (plan D-3): screens
// that need the server (reports, later verification/setup) bounce back to the
// weighing station until the user signs in online.
export const onlineOnlyGuard: CanActivateFn = () => {
  const offlineUnlock = inject(OfflineUnlockService);
  const router = inject(Router);

  if (offlineUnlock.offlineSession()) {
    return router.parseUrl('/weightscale');
  }
  return true;
};
