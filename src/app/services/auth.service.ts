import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { HttpPostService } from './http-post.service';
import { OfflineUnlockService } from './auth/offline-unlock.service';

export interface LoginResponse {
  status: { message: string };
  response: {
    token: string;
    company: string;
    companyName: string;
    branch: string;
    changepw?: boolean;
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly httpPost = inject(HttpPostService);
  private readonly offlineUnlock = inject(OfflineUnlockService);

  login(username: string, password: string): Observable<LoginResponse> {
    // authInterceptor recognises /authenticate and skips the Bearer header.
    return this.httpPost
      .post<LoginResponse>('authenticate', { username, password, app: 'Portal' })
      .pipe(
        tap((res) => {
          this.handleLoginResponse(res);
          if (res.status.message === 'SUCCESS') {
            // Seed/refresh the offline-unlock cache (no-op outside Electron).
            void this.offlineUnlock.cacheCredentials(username, password);
          }
        }),
      );
  }

  /**
   * Authenticated endpoint (Bearer required) — same contract the SFA web app
   * uses. Callers must have logged in first; on the login screen the change
   * flow therefore authenticates with the current password, then changes it.
   */
  changePassword(oldPassword: string, newPassword: string): Observable<{ response: boolean }> {
    const query = `oldpwd=${encodeURIComponent(oldPassword)}&newpwd=${encodeURIComponent(newPassword)}`;
    return this.httpPost.post<{ response: boolean }>(`api/chpw?${query}`, '');
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('user-data');
  }

  currentUserName(): string | null {
    return localStorage.getItem('userName');
  }

  private handleLoginResponse(res: LoginResponse): void {
    if (res.status.message !== 'SUCCESS') {
      return;
    }

    const jwtPayload = JSON.parse(window.atob(res.response.token.split('.')[1]));

    localStorage.setItem('token', res.response.token);
    localStorage.setItem('userName', jwtPayload.sub);
    localStorage.setItem('company', res.response.company);
    localStorage.setItem('companyName', res.response.companyName);
    localStorage.setItem('branchCode', res.response.branch);
    localStorage.setItem('user-data', JSON.stringify(res.response));
  }
}
