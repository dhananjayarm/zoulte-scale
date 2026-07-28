// Pure sync-drain logic (no Angular, no SQL) — the offline-first backbone,
// ported from zoulte-pos-ui. Claims due outbox events, pushes them via the
// CloudClient, and records the outcome: SYNCED, RETRYING with exponential
// backoff, or DEAD_LETTER (max attempts / server rejection). Never on the
// critical path of a capture.
import type { CloudClient } from './cloud-client';
import type { OutboxEvent, OutboxGateway } from './outbox-gateway';

export interface SyncConfig {
  batchSize: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  batchSize: 50,
  baseBackoffMs: 30_000,
  maxBackoffMs: 6 * 60 * 60_000,
};

export interface DrainSummary {
  synced: number;
  retried: number;
  deadLettered: number;
  skippedOffline: boolean;
}

export function backoffAt(attempt: number, fromIso: string, cfg: SyncConfig): string {
  const ms = Math.min(cfg.baseBackoffMs * 2 ** (attempt - 1), cfg.maxBackoffMs);
  return new Date(new Date(fromIso).getTime() + ms).toISOString();
}

export class SyncEngine {
  constructor(
    private readonly outbox: OutboxGateway,
    private readonly cloud: CloudClient,
    private readonly isOnline: () => boolean,
    private readonly supportedTypes: string[],
    private readonly cfg: SyncConfig = DEFAULT_SYNC_CONFIG,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async drainOutbox(): Promise<DrainSummary> {
    const summary: DrainSummary = { synced: 0, retried: 0, deadLettered: 0, skippedOffline: false };
    if (!this.isOnline()) {
      summary.skippedOffline = true;
      return summary;
    }

    const events = await this.outbox.claimDue(this.now(), this.cfg.batchSize, this.supportedTypes);
    if (events.length === 0) {
      return summary;
    }

    let results;
    try {
      results = await this.cloud.push(events);
    } catch (err) {
      // Transport failure: back off the whole batch.
      await this.retryBatch(events, describeError(err), summary);
      return summary;
    }

    const byUuid = new Map(results.map((r) => [r.entityUuid, r]));
    for (const evt of events) {
      const result = byUuid.get(evt.entityUuid);
      if (!result || result.status === 'ACCEPTED' || result.status === 'DUPLICATE') {
        await this.outbox.markSynced(evt, this.now());
        summary.synced++;
      } else {
        // Server rejected the payload — terminal, surfaced in the outbox panel.
        await this.outbox.markDeadLetter(evt, result.reason ?? 'rejected');
        summary.deadLettered++;
      }
    }
    return summary;
  }

  private async retryBatch(events: OutboxEvent[], error: string, summary: DrainSummary): Promise<void> {
    const at = this.now();
    for (const evt of events) {
      const attempt = evt.attemptCount + 1;
      if (attempt >= evt.maxAttempts) {
        await this.outbox.markDeadLetter(evt, 'max attempts exceeded');
        summary.deadLettered++;
      } else {
        await this.outbox.markRetrying(evt, error, backoffAt(attempt, at, this.cfg));
        summary.retried++;
      }
    }
  }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : 'network error';
}
