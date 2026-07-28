// SQL half of the transactional outbox. The SyncEngine (pure logic) talks to
// this narrow gateway so its batching/backoff/dead-letter behaviour can be
// unit-tested against an in-memory fake; only this file knows the ws_sync_outbox
// table shape. Pattern borrowed from zoulte-pos-ui's outbox/sync-engine pair.
import type { DataStore, SqlOp } from '../data/datastore';

export type OutboxStatus = 'QUEUED' | 'SENDING' | 'SYNCED' | 'RETRYING' | 'DEAD_LETTER';

export interface OutboxEvent {
  outboxId: number;
  entityType: string;
  entityUuid: string;
  operation: 'CREATE' | 'UPDATE';
  payload: unknown;
  attemptCount: number;
  maxAttempts: number;
}

export interface OutboxRow extends OutboxEvent {
  syncStatus: OutboxStatus;
  lastError: string | null;
  createdAt: string;
  nextAttemptAt: string | null;
}

/** entity_type -> (table, uuid column) for mirroring sync_status onto the entity row. */
const ENTITY_TABLE: Record<string, { table: string; key: string }> = {
  READING: { table: 'ws_reading', key: 'reading_uuid' },
  BALANCE_CHECK: { table: 'ws_balance_check', key: 'check_uuid' },
  AUDIT: { table: 'ws_audit', key: 'audit_uuid' },
};

/**
 * Build the outbox insert for a locally-originated change — always executed in
 * the SAME transaction as the business row, so sync state can never diverge
 * from business state. The UK (entity_type, entity_uuid, operation) coalesces
 * repeated pending events: the latest payload wins and the event re-queues.
 */
export function outboxOp(
  entityType: string,
  entityUuid: string,
  operation: 'CREATE' | 'UPDATE',
  payload: unknown,
  createdAt: string,
): SqlOp {
  return {
    sql: `INSERT INTO ws_sync_outbox (entity_type, entity_uuid, operation, payload, sync_status, created_at)
          VALUES (?, ?, ?, ?, 'QUEUED', ?)
          ON CONFLICT (entity_type, entity_uuid, operation) DO UPDATE SET
            payload = excluded.payload,
            sync_status = 'QUEUED',
            created_at = excluded.created_at,
            attempt_count = 0,
            last_error = NULL,
            next_attempt_at = NULL,
            sent_at = NULL,
            acked_at = NULL`,
    params: [entityType, entityUuid, operation, JSON.stringify(payload), createdAt],
  };
}

export interface OutboxGateway {
  /** Claim due QUEUED/RETRYING events (marks them SENDING) for the given types. */
  claimDue(nowIso: string, limit: number, types: string[]): Promise<OutboxEvent[]>;
  markSynced(evt: OutboxEvent, atIso: string): Promise<void>;
  markRetrying(evt: OutboxEvent, error: string, nextAttemptAt: string): Promise<void>;
  markDeadLetter(evt: OutboxEvent, error: string): Promise<void>;
  /** On startup, requeue events left SENDING by a crash (re-push is idempotent). */
  recoverStuck(): Promise<void>;
  counts(): Promise<{ pending: number; failed: number }>;
  listOpen(): Promise<OutboxRow[]>;
  requeue(outboxId: number): Promise<void>;
}

interface DbOutboxRow {
  outbox_id: number;
  entity_type: string;
  entity_uuid: string;
  operation: 'CREATE' | 'UPDATE';
  payload: string;
  attempt_count: number;
  max_attempts: number;
  sync_status: OutboxStatus;
  last_error: string | null;
  created_at: string;
  next_attempt_at: string | null;
}

export class SqliteOutboxGateway implements OutboxGateway {
  constructor(private readonly db: DataStore) {}

  async claimDue(nowIso: string, limit: number, types: string[]): Promise<OutboxEvent[]> {
    if (types.length === 0) {
      return [];
    }
    const typeMarks = types.map(() => '?').join(',');
    const rows = await this.db.query<DbOutboxRow>(
      `SELECT * FROM ws_sync_outbox
       WHERE entity_type IN (${typeMarks})
         AND (sync_status = 'QUEUED' OR (sync_status = 'RETRYING' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)))
       ORDER BY outbox_id LIMIT ?`,
      [...types, nowIso, limit],
    );
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((r) => r.outbox_id);
    await this.db.run(
      `UPDATE ws_sync_outbox SET sync_status = 'SENDING', sent_at = ? WHERE outbox_id IN (${ids.map(() => '?').join(',')})`,
      [nowIso, ...ids],
    );
    return rows.map(toEvent);
  }

  async markSynced(evt: OutboxEvent, atIso: string): Promise<void> {
    const ops: SqlOp[] = [
      {
        sql: "UPDATE ws_sync_outbox SET sync_status = 'SYNCED', acked_at = ? WHERE outbox_id = ?",
        params: [atIso, evt.outboxId],
      },
    ];
    const mirror = ENTITY_TABLE[evt.entityType];
    if (mirror) {
      ops.push({
        sql: `UPDATE ${mirror.table} SET sync_status = 'SYNCED', synced_at = ? WHERE ${mirror.key} = ?`,
        params: [atIso, evt.entityUuid],
      });
    }
    await this.db.transaction(ops);
  }

  async markRetrying(evt: OutboxEvent, error: string, nextAttemptAt: string): Promise<void> {
    await this.db.run(
      "UPDATE ws_sync_outbox SET sync_status = 'RETRYING', attempt_count = ?, last_error = ?, next_attempt_at = ? WHERE outbox_id = ?",
      [evt.attemptCount + 1, error, nextAttemptAt, evt.outboxId],
    );
  }

  async markDeadLetter(evt: OutboxEvent, error: string): Promise<void> {
    await this.db.run(
      "UPDATE ws_sync_outbox SET sync_status = 'DEAD_LETTER', attempt_count = ?, last_error = ? WHERE outbox_id = ?",
      [evt.attemptCount + 1, error, evt.outboxId],
    );
  }

  async recoverStuck(): Promise<void> {
    await this.db.run("UPDATE ws_sync_outbox SET sync_status = 'QUEUED' WHERE sync_status = 'SENDING'");
  }

  async counts(): Promise<{ pending: number; failed: number }> {
    const row = await this.db.get<{ pending: number; failed: number }>(
      `SELECT
         SUM(CASE WHEN sync_status IN ('QUEUED','SENDING','RETRYING') THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN sync_status = 'DEAD_LETTER' THEN 1 ELSE 0 END) AS failed
       FROM ws_sync_outbox`,
    );
    return { pending: row?.pending ?? 0, failed: row?.failed ?? 0 };
  }

  async listOpen(): Promise<OutboxRow[]> {
    const rows = await this.db.query<DbOutboxRow>(
      "SELECT * FROM ws_sync_outbox WHERE sync_status != 'SYNCED' ORDER BY outbox_id DESC LIMIT 100",
    );
    return rows.map((r) => ({
      ...toEvent(r),
      syncStatus: r.sync_status,
      lastError: r.last_error,
      createdAt: r.created_at,
      nextAttemptAt: r.next_attempt_at,
    }));
  }

  async requeue(outboxId: number): Promise<void> {
    await this.db.run(
      "UPDATE ws_sync_outbox SET sync_status = 'QUEUED', attempt_count = 0, last_error = NULL, next_attempt_at = NULL WHERE outbox_id = ?",
      [outboxId],
    );
  }
}

function toEvent(r: DbOutboxRow): OutboxEvent {
  return {
    outboxId: r.outbox_id,
    entityType: r.entity_type,
    entityUuid: r.entity_uuid,
    operation: r.operation,
    payload: safeParse(r.payload),
    attemptCount: r.attempt_count,
    maxAttempts: r.max_attempts,
  };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
