import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { OfflineUnlockService } from './auth/offline-unlock.service';

@Injectable({ providedIn: 'root' })
export class UtilService {
  private readonly router = inject(Router);
  private readonly offlineUnlock = inject(OfflineUnlockService);

  isTokenExpired(): boolean {
    const token = localStorage.getItem('token');
    if (!token) {
      return true;
    }
    const jwtPayload = JSON.parse(window.atob(token.split('.')[1]));
    return Math.floor(Date.now() / 1000) >= jwtPayload.exp;
  }

  logout(options: { sessionExpired?: boolean } = {}): void {
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    localStorage.removeItem('company');
    localStorage.removeItem('companyName');
    localStorage.removeItem('branchCode');
    localStorage.removeItem('user-data');
    this.offlineUnlock.endOfflineSession();
    // The flag lets the login screen explain *why* the user landed there.
    void this.router.navigate(['/login'], options.sessionExpired ? { queryParams: { expired: 1 } } : {});
  }
}
