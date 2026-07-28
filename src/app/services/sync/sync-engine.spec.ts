import { DEFAULT_SYNC_CONFIG, SyncEngine, backoffAt } from './sync-engine';
import type { CloudClient, CloudPushResult } from './cloud-client';
import type { OutboxEvent, OutboxGateway } from './outbox-gateway';

const NOW = '2026-07-27T10:00:00.000Z';

function event(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    outboxId: 1,
    entityType: 'READING',
    entityUuid: 'uuid-1',
    operation: 'CREATE',
    payload: { netWeight: 56.6 },
    attemptCount: 0,
    maxAttempts: 10,
    ...overrides,
  };
}

class FakeGateway implements OutboxGateway {
  due: OutboxEvent[] = [];
  synced: string[] = [];
  retried: { uuid: string; error: string; nextAttemptAt: string }[] = [];
  dead: { uuid: string; error: string }[] = [];
  claims = 0;

  async claimDue(): Promise<OutboxEvent[]> {
    this.claims++;
    const batch = this.due;
    this.due = [];
    return batch;
  }
  async markSynced(evt: OutboxEvent): Promise<void> {
    this.synced.push(evt.entityUuid);
  }
  async markRetrying(evt: OutboxEvent, error: string, nextAttemptAt: string): Promise<void> {
    this.retried.push({ uuid: evt.entityUuid, error, nextAttemptAt });
  }
  async markDeadLetter(evt: OutboxEvent, error: string): Promise<void> {
    this.dead.push({ uuid: evt.entityUuid, error });
  }
  async recoverStuck(): Promise<void> {}
  async counts(): Promise<{ pending: number; failed: number }> {
    return { pending: 0, failed: 0 };
  }
  async listOpen(): Promise<never[]> {
    return [];
  }
  async requeue(): Promise<void> {}
}

function cloudReturning(results: CloudPushResult[]): CloudClient {
  return { push: async () => results };
}

function cloudFailing(message = 'network down'): CloudClient {
  return {
    push: async () => {
      throw new Error(message);
    },
  };
}

function engine(gateway: FakeGateway, cloud: CloudClient, online = true): SyncEngine {
  return new SyncEngine(gateway, cloud, () => online, ['READING'], DEFAULT_SYNC_CONFIG, () => NOW);
}

describe('SyncEngine.drainOutbox', () => {
  it('does nothing while offline — never even claims', async () => {
    const gateway = new FakeGateway();
    gateway.due = [event()];
    const summary = await engine(gateway, cloudReturning([]), false).drainOutbox();
    expect(summary.skippedOffline).toBeTrue();
    expect(gateway.claims).toBe(0);
  });

  it('marks accepted and duplicate results as synced (idempotent re-push)', async () => {
    const gateway = new FakeGateway();
    gateway.due = [event({ entityUuid: 'a' }), event({ outboxId: 2, entityUuid: 'b' })];
    const cloud = cloudReturning([
      { entityUuid: 'a', status: 'ACCEPTED' },
      { entityUuid: 'b', status: 'DUPLICATE' },
    ]);
    const summary = await engine(gateway, cloud).drainOutbox();
    expect(summary.synced).toBe(2);
    expect(gateway.synced).toEqual(['a', 'b']);
  });

  it('dead-letters server rejections with the reason', async () => {
    const gateway = new FakeGateway();
    gateway.due = [event({ entityUuid: 'bad' })];
    const cloud = cloudReturning([{ entityUuid: 'bad', status: 'REJECTED', reason: 'expiry before mfg' }]);
    const summary = await engine(gateway, cloud).drainOutbox();
    expect(summary.deadLettered).toBe(1);
    expect(gateway.dead[0]).toEqual({ uuid: 'bad', error: 'expiry before mfg' });
  });

  it('backs off the whole batch on transport failure', async () => {
    const gateway = new FakeGateway();
    gateway.due = [event({ entityUuid: 'a' }), event({ outboxId: 2, entityUuid: 'b', attemptCount: 3 })];
    const summary = await engine(gateway, cloudFailing()).drainOutbox();
    expect(summary.retried).toBe(2);
    expect(gateway.retried.map((r) => r.uuid)).toEqual(['a', 'b']);
    // attempt 4 backs off further than attempt 1
    expect(gateway.retried[1].nextAttemptAt > gateway.retried[0].nextAttemptAt).toBeTrue();
  });

  it('dead-letters an event that exhausts max attempts', async () => {
    const gateway = new FakeGateway();
    gateway.due = [event({ attemptCount: 9, maxAttempts: 10 })];
    const summary = await engine(gateway, cloudFailing()).drainOutbox();
    expect(summary.deadLettered).toBe(1);
    expect(gateway.dead[0].error).toBe('max attempts exceeded');
  });
});

describe('backoffAt', () => {
  it('doubles per attempt and caps at maxBackoffMs', () => {
    const cfg = { batchSize: 50, baseBackoffMs: 30_000, maxBackoffMs: 120_000 };
    const t0 = Date.parse(NOW);
    expect(Date.parse(backoffAt(1, NOW, cfg)) - t0).toBe(30_000);
    expect(Date.parse(backoffAt(2, NOW, cfg)) - t0).toBe(60_000);
    expect(Date.parse(backoffAt(3, NOW, cfg)) - t0).toBe(120_000);
    expect(Date.parse(backoffAt(10, NOW, cfg)) - t0).toBe(120_000); // capped
  });
});
