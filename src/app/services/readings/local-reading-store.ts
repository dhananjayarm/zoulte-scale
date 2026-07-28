// Electron implementation: every capture lands in SQLite first — business row,
// audit event, and outbox entry in ONE transaction — then the sync pipeline
// pushes it to the server in the background. Offline is not a special case,
// just a longer queue.
import { Injectable, inject } from '@angular/core';
import { IpcDataStore } from '../data/datastore';
import { nowIso, uuid } from '../data/ids';
import { AuthService } from '../auth.service';
import { SyncService } from '../sync/sync.service';
import { outboxOp } from '../sync/outbox-gateway';
import {
  ReadingStore,
  toServerProduct,
  type CaptureDraft,
  type StoredReading,
} from './reading-store';

interface DbReadingRow {
  reading_uuid: string;
  product_name: string;
  manufacturer_name: string;
  batch_no: string;
  manufacturing_date: string;
  expiry_date: string;
  net_weight: number;
  unit: string;
  stable_flag: number | null;
  captured_at_client: string;
  sync_status: 'PENDING' | 'SYNCED';
}

@Injectable({ providedIn: 'root' })
export class LocalReadingStore extends ReadingStore {
  override readonly supportsVoid = true;

  private readonly db = new IpcDataStore();
  private readonly auth = inject(AuthService);
  private readonly sync = inject(SyncService);

  async loadReadings(): Promise<StoredReading[]> {
    const rows = await this.db.query<DbReadingRow>(
      `SELECT reading_uuid, product_name, manufacturer_name, batch_no, manufacturing_date,
              expiry_date, net_weight, unit, stable_flag, captured_at_client, sync_status
       FROM ws_reading
       WHERE status = 'ACTIVE'
       ORDER BY captured_at_client DESC
       LIMIT 500`,
    );
    return rows.map(toStoredReading);
  }

  async saveCapture(draft: CaptureDraft): Promise<StoredReading> {
    const readingUuid = uuid();
    const capturedAt = nowIso();
    const operator = this.auth.currentUserName() ?? 'unknown';
    const payload = { ...toServerProduct(draft), readingUuid, capturedAtClient: capturedAt, operator };

    await this.db.transaction([
      {
        sql: `INSERT INTO ws_reading (reading_uuid, product_name, manufacturer_name, batch_no,
                manufacturing_date, expiry_date, net_weight, unit, stable_flag, operator,
                captured_at_client, company_code, branch_code)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          readingUuid,
          draft.productName,
          draft.manufacturerName,
          draft.batchNumber,
          draft.manufactureDate,
          draft.expiryDate,
          draft.weight,
          draft.unitWeight,
          draft.stable === null ? null : draft.stable ? 1 : 0,
          operator,
          capturedAt,
          localStorage.getItem('company'),
          localStorage.getItem('branchCode'),
        ],
      },
      {
        sql: `INSERT INTO ws_audit (audit_uuid, entity_type, entity_uuid, event, actor, at_client, detail_json)
              VALUES (?, 'READING', ?, 'READING_CAPTURED', ?, ?, ?)`,
        params: [
          uuid(),
          readingUuid,
          operator,
          capturedAt,
          JSON.stringify({ weight: draft.weight, unit: draft.unitWeight, stable: draft.stable }),
        ],
      },
      outboxOp('READING', readingUuid, 'CREATE', payload, capturedAt),
    ]);

    // Fire-and-forget nudge — the capture is already durable locally.
    void this.sync.drainNow();

    return this.asStored(draft, readingUuid, capturedAt);
  }

  /**
   * Pharma correction rule (plan D-6): never delete. The row flips to VOID with
   * full attribution, the audit trail records it, and a VOID event queues for
   * the server (it drains once the backend endpoint exists — F-002).
   */
  async voidReading(readingUuid: string, reason: string): Promise<void> {
    const at = nowIso();
    const actor = this.auth.currentUserName() ?? 'unknown';
    await this.db.transaction([
      {
        sql: `UPDATE ws_reading SET status = 'VOID', void_reason = ?, voided_by = ?, voided_at = ?
              WHERE reading_uuid = ? AND status = 'ACTIVE'`,
        params: [reason, actor, at, readingUuid],
      },
      {
        sql: `INSERT INTO ws_audit (audit_uuid, entity_type, entity_uuid, event, actor, at_client, detail_json)
              VALUES (?, 'READING', ?, 'READING_VOIDED', ?, ?, ?)`,
        params: [uuid(), readingUuid, actor, at, JSON.stringify({ reason })],
      },
      outboxOp('VOID', readingUuid, 'UPDATE', { readingUuid, reason, voidedBy: actor, voidedAt: at }, at),
    ]);
    await this.sync.refreshCounts();
  }

  private asStored(draft: CaptureDraft, readingUuid: string, capturedAt: string): StoredReading {
    return {
      uuid: readingUuid,
      manufacturerName: draft.manufacturerName,
      productName: draft.productName,
      batchNumber: draft.batchNumber,
      manufactureDate: draft.manufactureDate,
      expiryDate: draft.expiryDate,
      weight: draft.weight,
      unit: draft.unitWeight,
      stable: draft.stable,
      capturedAt,
      syncStatus: 'PENDING',
    };
  }
}

function toStoredReading(row: DbReadingRow): StoredReading {
  return {
    uuid: row.reading_uuid,
    manufacturerName: row.manufacturer_name,
    productName: row.product_name,
    batchNumber: row.batch_no,
    manufactureDate: row.manufacturing_date,
    expiryDate: row.expiry_date,
    weight: row.net_weight,
    unit: row.unit,
    stable: row.stable_flag === null ? null : row.stable_flag === 1,
    capturedAt: row.captured_at_client,
    syncStatus: row.sync_status,
  };
}
