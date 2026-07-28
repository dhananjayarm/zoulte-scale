// Browser implementation — preserves the original web app's behaviour (direct
// HTTP, no local queue) so `ng serve` outside Electron still works end-to-end.
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { HttpGetService, type WeightScaleProduct } from '../http-get.service';
import { HttpPostService } from '../http-post.service';
import { uuid } from '../data/ids';
import {
  ReadingStore,
  toServerProduct,
  type CaptureDraft,
  type StoredReading,
} from './reading-store';

interface WeightScaleProductListResponse {
  status: { message: string };
  response: WeightScaleProduct[];
}

// Backend key casing for the creation timestamp is unconfirmed, so check the
// common variants instead of hard-coding one and silently showing "—".
const CREATED_DATE_KEYS = [
  'createdDate',
  'createddate',
  'createdOn',
  'CreatedDate',
  'CreatedOn',
  'createdAt',
  'dateCreated',
  'insertedDate',
];

function resolveCreatedDate(product: WeightScaleProduct): string | number | null {
  for (const key of CREATED_DATE_KEYS) {
    const value = product[key];
    if (typeof value === 'string' || typeof value === 'number') {
      return value;
    }
  }
  return null;
}

@Injectable({ providedIn: 'root' })
export class RemoteReadingStore extends ReadingStore {
  // No server void endpoint yet (FINDINGS F-002) — the UI hides the action.
  override readonly supportsVoid = false;

  private readonly httpGet = inject(HttpGetService);
  private readonly httpPost = inject(HttpPostService);

  async voidReading(): Promise<void> {
    throw new Error('Voiding is only available on the Electron station.');
  }

  async loadReadings(): Promise<StoredReading[]> {
    const res = await firstValueFrom(
      this.httpGet.getSfa<WeightScaleProductListResponse>('api/weightscaleproducts'),
    );
    return res.response.map((product) => this.toStoredReading(product, null, resolveCreatedDate(product)));
  }

  async saveCapture(draft: CaptureDraft): Promise<StoredReading> {
    const product = toServerProduct(draft);
    await firstValueFrom(this.httpPost.postSfa<WeightScaleProduct>('api/weightscaleproduct', [product]));
    return this.toStoredReading(product, draft.stable, Date.now());
  }

  private toStoredReading(
    product: WeightScaleProduct,
    stable: boolean | null,
    capturedAt: string | number | null,
  ): StoredReading {
    return {
      uuid: uuid(),
      manufacturerName: product.manufacturerName,
      productName: product.productName,
      batchNumber: product.batchNo,
      manufactureDate: product.manufacturingDate,
      expiryDate: product.expiryDate,
      weight: product.netWeight,
      unit: product.unitWeight,
      stable,
      capturedAt,
      // No local queue in the browser — a save only succeeds by reaching the server.
      syncStatus: 'SYNCED',
    };
  }
}
