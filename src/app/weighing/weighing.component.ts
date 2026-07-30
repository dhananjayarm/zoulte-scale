import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormsModule,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ScaleSerialService } from '../services/scale-serial.service';
import { ReadingStore, type StoredReading } from '../services/readings/reading-store';
import { MaterialApiService, type ProductRow } from '../services/masters/material-api.service';
import { toUnitSymbol, toUnitWeight } from '../services/data/units';

const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];

function expiryAfterManufactureValidator(group: AbstractControl): ValidationErrors | null {
  const manufactureDate = group.get('manufactureDate')?.value;
  const expiryDate = group.get('expiryDate')?.value;
  if (!manufactureDate || !expiryDate) {
    return null;
  }
  return new Date(expiryDate) > new Date(manufactureDate) ? null : { expiryBeforeManufacture: true };
}

/** Columns the Recent Captures table can be sorted by. */
type CaptureSortKey = 'product' | 'batch' | 'weight' | 'time' | 'status';

const CAPTURE_COLUMNS: ReadonlyArray<{ key: CaptureSortKey; label: string }> = [
  { key: 'product', label: 'Product' },
  { key: 'batch', label: 'Batch' },
  { key: 'weight', label: 'Weight' },
  { key: 'time', label: 'Time' },
  { key: 'status', label: 'Status' },
];

function compareCaptures(a: StoredReading, b: StoredReading, key: CaptureSortKey): number {
  switch (key) {
    case 'product':
      return a.productName.localeCompare(b.productName);
    case 'batch':
      return a.batchNumber.localeCompare(b.batchNumber);
    case 'weight':
      return a.weight - b.weight;
    case 'time':
      return toTimestamp(a.capturedAt) - toTimestamp(b.capturedAt);
    case 'status':
      return a.syncStatus.localeCompare(b.syncStatus);
  }
}

/** Captures with no resolvable timestamp sort oldest, so they never lead the list. */
function toTimestamp(capturedAt: string | number | null): number {
  if (capturedAt == null) {
    return 0;
  }
  const ms = typeof capturedAt === 'number' ? capturedAt : Date.parse(capturedAt);
  return Number.isNaN(ms) ? 0 : ms;
}

/** The product/batch context all captures in a session are recorded against. */
interface WeighingSession {
  manufacturerName: string;
  productName: string;
  batchNumber: string;
  manufactureDate: string;
  expiryDate: string;
}

@Component({
  selector: 'app-weighing',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './weighing.component.html',
  styleUrl: './weighing.component.css',
})
export class WeighingComponent implements OnInit {
  private readonly scale = inject(ScaleSerialService);
  private readonly fb = inject(FormBuilder);
  private readonly materialApi = inject(MaterialApiService);
  protected readonly store = inject(ReadingStore);

  readonly baudRates = BAUD_RATES;
  baudRate = 9600;

  readonly products = signal<ProductRow[]>([]);

  readonly sessionForm = this.fb.group(
    {
      productName: ['', Validators.required],
      batchNumber: ['', Validators.required],
      manufacturerName: ['', Validators.required],
      manufactureDate: ['', Validators.required],
      expiryDate: ['', Validators.required],
    },
    { validators: expiryAfterManufactureValidator }
  );

  /** Set once the operator starts the session; captures record against it. */
  readonly session = signal<WeighingSession | null>(null);

  readonly readings = signal<StoredReading[]>([]);
  readonly isSaving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);

  readonly connectionState = this.scale.connectionState;
  readonly lastError = this.scale.lastError;
  readonly latestReading = this.scale.latestReading;
  readonly portInfo = this.scale.portInfo;
  readonly isSupported = this.scale.isSupported;

  readonly isConnected = computed(() => this.connectionState() === 'connected');
  readonly isConnecting = computed(() => this.connectionState() === 'connecting');
  readonly isStable = computed(() => this.latestReading()?.stable === true);

  readonly captureSearchTerm = signal('');
  readonly filteredCaptures = computed(() => {
    const term = this.captureSearchTerm().trim().toLowerCase();
    if (!term) {
      return this.readings();
    }
    return this.readings().filter(
      (r) => r.productName.toLowerCase().includes(term) || r.batchNumber.toLowerCase().includes(term),
    );
  });

  readonly captureColumns = CAPTURE_COLUMNS;
  readonly captureSortKey = signal<CaptureSortKey>('time');
  readonly captureSortDir = signal<'asc' | 'desc'>('desc');

  /**
   * Sorting happens before paging, so the order runs across every capture rather
   * than shuffling the ten rows that happen to be on screen. It also gives the
   * browser store its ordering — that one returns rows in server order.
   */
  readonly sortedCaptures = computed(() => {
    const key = this.captureSortKey();
    const direction = this.captureSortDir() === 'asc' ? 1 : -1;
    return [...this.filteredCaptures()].sort((a, b) => direction * compareCaptures(a, b, key));
  });

  readonly capturePageSize = signal(12);
  readonly captureCurrentPage = signal(1);
  readonly captureTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredCaptures().length / this.capturePageSize())),
  );
  readonly recentCaptures = computed(() => {
    const page = Math.min(this.captureCurrentPage(), this.captureTotalPages());
    const size = this.capturePageSize();
    const start = (page - 1) * size;
    return this.sortedCaptures().slice(start, start + size);
  });

  /** Clicking the active column flips direction; a new column opens on its most useful end. */
  sortCaptures(key: CaptureSortKey): void {
    if (this.captureSortKey() === key) {
      this.captureSortDir.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      this.captureSortKey.set(key);
      // Newest and heaviest first read better than the reverse; names read A→Z.
      this.captureSortDir.set(key === 'time' || key === 'weight' ? 'desc' : 'asc');
    }
    this.captureCurrentPage.set(1);
  }

  captureSortArrow(key: CaptureSortKey): string {
    return this.captureSortKey() === key && this.captureSortDir() === 'asc' ? '▲' : '▼';
  }

  captureAriaSort(key: CaptureSortKey): 'ascending' | 'descending' | 'none' {
    if (this.captureSortKey() !== key) {
      return 'none';
    }
    return this.captureSortDir() === 'asc' ? 'ascending' : 'descending';
  }

  unitSymbol(unitWeight: string): string {
    return toUnitSymbol(unitWeight);
  }

  onCaptureSearchChange(term: string): void {
    this.captureSearchTerm.set(term);
    this.captureCurrentPage.set(1);
  }

  onCapturePageSizeChange(size: number): void {
    this.capturePageSize.set(size);
    this.captureCurrentPage.set(1);
  }

  goToCapturePage(page: number): void {
    this.captureCurrentPage.set(Math.min(Math.max(1, page), this.captureTotalPages()));
  }

  /** Page numbers to render, with `null` standing in for a "…" gap. Always shows first/last and a window around the current page. */
  readonly capturePageNumbers = computed<(number | null)[]>(() => {
    const total = this.captureTotalPages();
    const current = Math.min(this.captureCurrentPage(), total);
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | null)[] = [1];
    if (current > 3) {
      pages.push(null);
    }
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    if (current < total - 2) {
      pages.push(null);
    }
    pages.push(total);
    return pages;
  });

  /** Running count for the active session's batch — "where was I?" after any interruption. */
  readonly sessionCaptureCount = computed(() => {
    const session = this.session();
    if (!session) {
      return 0;
    }
    return this.readings().filter(
      (r) => r.productName === session.productName && r.batchNumber === session.batchNumber
    ).length;
  });

  readonly canCapture = computed(
    () => this.session() !== null && this.isConnected() && this.isStable() && !this.isSaving()
  );

  /** One line telling the operator exactly what still blocks Capture. */
  readonly captureHint = computed(() => {
    if (this.isSaving()) {
      return 'Saving…';
    }
    if (!this.session()) {
      return 'Start a weighing session first.';
    }
    if (!this.isConnected()) {
      return 'Scale is not connected.';
    }
    const reading = this.latestReading();
    if (!reading?.value && reading?.value !== 0) {
      return 'Waiting for a reading from the scale…';
    }
    if (!this.isStable()) {
      return 'Waiting for the reading to settle…';
    }
    return '';
  });

  ngOnInit(): void {
    void this.loadReadings();
    this.materialApi.listProducts().subscribe((rows) => this.products.set(rows));
  }

  connect(): void {
    void this.scale.connect({ baudRate: this.baudRate });
  }

  disconnect(): void {
    void this.scale.disconnect();
  }

  startSession(): void {
    if (this.sessionForm.invalid) {
      this.sessionForm.markAllAsTouched();
      return;
    }
    const { manufacturerName, productName, batchNumber, manufactureDate, expiryDate } =
      this.sessionForm.getRawValue();
    this.session.set({
      manufacturerName: (manufacturerName ?? '').trim(),
      productName: (productName ?? '').trim(),
      batchNumber: (batchNumber ?? '').trim(),
      manufactureDate: manufactureDate ?? '',
      expiryDate: expiryDate ?? '',
    });
  }

  changeSession(): void {
    this.session.set(null);
  }

  async captureReading(): Promise<void> {
    const session = this.session();
    const reading = this.latestReading();
    if (!session || !this.canCapture() || reading?.value == null) {
      return;
    }

    this.isSaving.set(true);
    this.saveError.set(null);
    try {
      const saved = await this.store.saveCapture({
        ...session,
        weight: reading.value,
        unit: reading.unit ?? 'g',
        unitWeight: toUnitWeight(reading.unit),
        stable: reading.stable,
      });
      this.readings.update((readings) => [saved, ...readings]);
    } catch (err) {
      this.saveError.set(describeSaveError(err));
    } finally {
      this.isSaving.set(false);
    }
  }

  private async loadReadings(): Promise<void> {
    try {
      this.readings.set(await this.store.loadReadings());
    } catch {
      this.loadError.set('Unable to load saved readings.');
    }
  }
}

function describeSaveError(err: unknown): string {
  const serverMessage = (err as { error?: { status?: { message?: string } } })?.error?.status?.message;
  return serverMessage ?? 'Failed to save reading.';
}
