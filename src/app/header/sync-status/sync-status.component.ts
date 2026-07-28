import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { ConnectivityService } from '../../services/sync/connectivity.service';
import { SyncService } from '../../services/sync/sync.service';
import { ScaleSerialService } from '../../services/scale-serial.service';
import { OfflineUnlockService } from '../../services/auth/offline-unlock.service';
import type { OutboxRow } from '../../services/sync/outbox-gateway';

// The "trust the station at a glance" strip: network, scale, and sync-queue
// state in the header, with the outbox panel behind the sync badge.
@Component({
  selector: 'app-sync-status',
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sync-status.component.html',
  styleUrl: './sync-status.component.css',
})
export class SyncStatusComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  protected readonly connectivity = inject(ConnectivityService);
  protected readonly sync = inject(SyncService);
  protected readonly offlineUnlock = inject(OfflineUnlockService);
  private readonly scale = inject(ScaleSerialService);

  protected readonly scaleState = this.scale.connectionState;
  protected readonly panelOpen = signal(false);
  protected readonly rows = signal<OutboxRow[]>([]);

  async togglePanel(): Promise<void> {
    const opening = !this.panelOpen();
    this.panelOpen.set(opening);
    if (opening) {
      await this.refreshRows();
    }
  }

  async syncNow(): Promise<void> {
    await this.sync.drainNow();
    await this.refreshRows();
  }

  async retry(row: OutboxRow): Promise<void> {
    await this.sync.retry(row.outboxId);
    await this.refreshRows();
  }

  private async refreshRows(): Promise<void> {
    this.rows.set(await this.sync.listOpen());
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.panelOpen.set(false);
    }
  }
}
