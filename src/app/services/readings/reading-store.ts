// Capture-path port. The weighing screen talks only to this abstraction;
// which side of it runs depends on where the app is:
//   Electron  -> LocalReadingStore  (SQLite-first, outbox sync)
//   browser   -> RemoteReadingStore (direct HTTP, as the original web app)
import type { WeightScaleProduct } from '../http-get.service';

export interface CaptureDraft {
  manufacturerName: string;
  productName: string;
  batchNumber: string;
  manufactureDate: string;
  expiryDate: string;
  weight: number;
  /** Raw device unit (g/kg/…) — kept alongside the server's enum form. */
  unit: string;
  unitWeight: string;
  stable: boolean | null;
}

export type ReadingSyncStatus = 'PENDING' | 'SYNCED';

export interface StoredReading {
  uuid: string;
  manufacturerName: string;
  productName: string;
  batchNumber: string;
  manufactureDate: string;
  expiryDate: string;
  weight: number;
  unit: string;
  stable: boolean | null;
  capturedAt: string | number | null;
  syncStatus: ReadingSyncStatus;
}

export abstract class ReadingStore {
  /** Voiding needs the local immutable-record pipeline — Electron only for now. */
  abstract readonly supportsVoid: boolean;
  abstract loadReadings(): Promise<StoredReading[]>;
  abstract saveCapture(draft: CaptureDraft): Promise<StoredReading>;
  abstract voidReading(uuid: string, reason: string): Promise<void>;
}

/** Server payload for a capture — also the outbox payload in Electron. */
export function toServerProduct(draft: CaptureDraft): WeightScaleProduct {
  return {
    productName: draft.productName,
    batchNo: draft.batchNumber,
    manufacturerName: draft.manufacturerName,
    manufacturingDate: draft.manufactureDate,
    expiryDate: draft.expiryDate,
    netWeight: draft.weight,
    unitWeight: draft.unitWeight,
  };
}
