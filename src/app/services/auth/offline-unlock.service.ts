// Offline unlock (plan D-3): the first login on a station must be online;
// that login seeds ws_user_cache with a PBKDF2 verifier. With no network, a
// previously-seen user can unlock into CAPTURE-ONLY mode — weigh and queue,
// nothing else. Sync, verification, and reports still require a real session.
import { Injectable, signal } from '@angular/core';
import { IpcDataStore, hasLocalStore } from '../data/datastore';
import { nowIso } from '../data/ids';
import { hashPassword, verifyPassword } from './password-hash';

const MAX_FAILED_ATTEMPTS = 5;
const OFFLINE_SESSION_KEY = 'offline-session';

export type UnlockError = 'NOT_AVAILABLE' | 'UNKNOWN_USER' | 'INVALID_CREDENTIALS' | 'LOCKED';

export interface UnlockResult {
  ok: boolean;
  error?: UnlockError;
}

interface UserCacheRow {
  user_name: string;
  display_name: string | null;
  pwd_verifier: string;
  is_active: number;
}

@Injectable({ providedIn: 'root' })
export class OfflineUnlockService {
  readonly available = hasLocalStore();

  /** True while the current session came from an offline unlock. */
  readonly offlineSession = signal(sessionStorage.getItem(OFFLINE_SESSION_KEY) === '1');

  private readonly db = this.available ? new IpcDataStore() : null;
  // Per-app-session lockout, as in the POS: 5 straight failures locks the name.
  private readonly failures = new Map<string, number>();

  /** Called after every successful ONLINE login — keeps the cache fresh. */
  async cacheCredentials(username: string, password: string): Promise<void> {
    if (!this.db) {
      return;
    }
    const verifier = await hashPassword(password);
    await this.db.run(
      `INSERT INTO ws_user_cache (user_name, pwd_verifier, last_online_login)
       VALUES (?, ?, ?)
       ON CONFLICT (user_name) DO UPDATE SET
         pwd_verifier = excluded.pwd_verifier,
         last_online_login = excluded.last_online_login,
         is_active = 1`,
      [username, verifier, nowIso()],
    );
    this.failures.delete(username);
    this.markSession(false);
  }

  async tryUnlock(username: string, password: string): Promise<UnlockResult> {
    if (!this.db) {
      return { ok: false, error: 'NOT_AVAILABLE' };
    }
    if ((this.failures.get(username) ?? 0) >= MAX_FAILED_ATTEMPTS) {
      return { ok: false, error: 'LOCKED' };
    }

    const cached = await this.db.get<UserCacheRow>(
      'SELECT user_name, display_name, pwd_verifier, is_active FROM ws_user_cache WHERE user_name = ?',
      [username],
    );
    if (!cached || cached.is_active !== 1) {
      return { ok: false, error: 'UNKNOWN_USER' };
    }

    if (!(await verifyPassword(password, cached.pwd_verifier))) {
      const failed = (this.failures.get(username) ?? 0) + 1;
      this.failures.set(username, failed);
      return { ok: false, error: failed >= MAX_FAILED_ATTEMPTS ? 'LOCKED' : 'INVALID_CREDENTIALS' };
    }

    this.failures.delete(username);
    // Same localStorage keys a real login sets, so authGuard and the header
    // work unchanged — minus any token, which an offline session never has.
    localStorage.setItem('userName', cached.user_name);
    localStorage.setItem('user-data', JSON.stringify({ offline: true }));
    this.markSession(true);
    return { ok: true };
  }

  endOfflineSession(): void {
    this.markSession(false);
  }

  private markSession(offline: boolean): void {
    this.offlineSession.set(offline);
    if (offline) {
      sessionStorage.setItem(OFFLINE_SESSION_KEY, '1');
    } else {
      sessionStorage.removeItem(OFFLINE_SESSION_KEY);
    }
  }
}
