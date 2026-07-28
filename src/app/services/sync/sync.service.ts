// Angular face of the sync pipeline: owns the SyncEngine, a background drain
// tick, and the signals the header/outbox panel render. In a plain browser
// (no local store) everything is a visible no-op — pending stays 0.
import { Injectable, inject, signal } from '@angular/core';
import { IpcDataStore, hasLocalStore } from '../data/datastore';
import { nowIso } from '../data/ids';
import { ConnectivityService } from './connectivity.service';
import { HttpCloudClient, SUPPORTED_ENTITY_TYPES } from './cloud-client';
import { SqliteOutboxGateway, type OutboxRow } from './outbox-gateway';
import { SyncEngine } from './sync-engine';

const DRAIN_TICK_MS = 10_000;

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly connectivity = inject(ConnectivityService);
  private readonly cloud = inject(HttpCloudClient);

  readonly enabled = hasLocalStore();
  readonly pending = signal(0);
  readonly failed = signal(0);
  readonly lastSyncAt = signal<string | null>(null);

  private readonly outbox = this.enabled ? new SqliteOutboxGateway(new IpcDataStore()) : null;
  private readonly engine = this.outbox
    ? new SyncEngine(this.outbox, this.cloud, () => this.connectivity.isOnline(), SUPPORTED_ENTITY_TYPES)
    : null;

  private started = false;
  private draining = false;

  /** Called once from the app shell. Recovers crash-stuck rows, then ticks. */
  start(): void {
    if (!this.enabled || this.started) {
      return;
    }
    this.started = true;
    void this.outbox!.recoverStuck().then(() => this.drainNow());
    setInterval(() => void this.drainNow(), DRAIN_TICK_MS);
    // Coming back online is the moment the queue can actually move — drain
    // immediately instead of waiting out the tick.
    window.addEventListener('online', () => void this.drainNow());
  }

  async drainNow(): Promise<void> {
    if (!this.engine || this.draining) {
      return;
    }
    this.draining = true;
    try {
      const summary = await this.engine.drainOutbox();
      if (summary.synced > 0) {
        this.lastSyncAt.set(nowIso());
      }
    } finally {
      this.draining = false;
      await this.refreshCounts();
    }
  }

  async refreshCounts(): Promise<void> {
    if (!this.outbox) {
      return;
    }
    const { pending, failed } = await this.outbox.counts();
    this.pending.set(pending);
    this.failed.set(failed);
  }

  async listOpen(): Promise<OutboxRow[]> {
    return this.outbox ? this.outbox.listOpen() : [];
  }

  async retry(outboxId: number): Promise<void> {
    if (!this.outbox) {
      return;
    }
    await this.outbox.requeue(outboxId);
    await this.drainNow();
  }
}
