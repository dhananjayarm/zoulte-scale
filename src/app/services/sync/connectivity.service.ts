import { Injectable, signal } from '@angular/core';

// Connectivity source of truth: the SyncService drains only when online, and
// the header shows the state. Tracks navigator.onLine; tests can override.
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly _online = signal<boolean>(typeof navigator === 'undefined' || navigator.onLine);
  readonly online = this._online.asReadonly();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this._online.set(true));
      window.addEventListener('offline', () => this._online.set(false));
    }
  }

  isOnline(): boolean {
    return this._online();
  }

  /** Manual override for tests / a future demo toggle. */
  setOnline(v: boolean): void {
    this._online.set(v);
  }
}
