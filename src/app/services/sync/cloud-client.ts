// Cloud half of the sync pipeline. Until the backend ships a dedicated batch
// sync endpoint (FINDINGS F-002), READING creates map onto the existing
// api/weightscaleproduct POST. The engine only ever drains entity types listed
// in SUPPORTED_ENTITY_TYPES — anything else stays queued harmlessly until its
// endpoint exists.
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { HttpPostService } from '../http-post.service';
import type { OutboxEvent } from './outbox-gateway';

export const SUPPORTED_ENTITY_TYPES = ['READING'];

export interface CloudPushResult {
  entityUuid: string;
  status: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED';
  reason?: string;
}

export interface CloudClient {
  /**
   * Push events to the server. Resolves with a per-event verdict; throws only
   * on transport failure (network/5xx), which the engine treats as retryable.
   */
  push(events: OutboxEvent[]): Promise<CloudPushResult[]>;
}

@Injectable({ providedIn: 'root' })
export class HttpCloudClient implements CloudClient {
  private readonly httpPost = inject(HttpPostService);

  async push(events: OutboxEvent[]): Promise<CloudPushResult[]> {
    const results: CloudPushResult[] = [];
    // Sequential on purpose: batches are small and order-preserving keeps the
    // server's created timestamps aligned with capture order.
    for (const evt of events) {
      results.push(await this.pushOne(evt));
    }
    return results;
  }

  private async pushOne(evt: OutboxEvent): Promise<CloudPushResult> {
    try {
      await firstValueFrom(this.httpPost.postSfa('api/weightscaleproduct', [evt.payload]));
      return { entityUuid: evt.entityUuid, status: 'ACCEPTED' };
    } catch (err) {
      // 4xx = the server understood and refused (validation) — terminal for
      // this payload. Anything else (network, 5xx, timeout) is retryable.
      if (err instanceof HttpErrorResponse && err.status >= 400 && err.status < 500) {
        return {
          entityUuid: evt.entityUuid,
          status: 'REJECTED',
          reason: err.error?.status?.message ?? `HTTP ${err.status}`,
        };
      }
      throw err;
    }
  }
}
