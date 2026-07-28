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

const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
const RECENT_LIMIT = 10;

const UNIT_WEIGHT_MAP: Record<string, string> = {
  g: 'GRAM',
  kg: 'KILOGRAM',
  mg: 'MILLIGRAM',
  lb: 'POUND',
  oz: 'OUNCE',
};

function toUnitWeight(unit: string | null): string {
  if (!unit) {
    return 'GRAM';
  }
  return UNIT_WEIGHT_MAP[unit.toLowerCase()] ?? unit.toUpperCase();
}

function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function expiryAfterManufactureValidator(group: AbstractControl): ValidationErrors | null {
  const manufactureDate = group.get('manufactureDate')?.value;
  const expiryDate = group.get('expiryDate')?.value;
  if (!manufactureDate || !expiryDate) {
    return null;
  }
  return new Date(expiryDate) > new Date(manufactureDate) ? null : { expiryBeforeManufacture: true };
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
  protected readonly store = inject(ReadingStore);

  readonly baudRates = BAUD_RATES;
  baudRate = 9600;

  readonly sessionForm = this.fb.group(
    {
      manufacturerName: ['', Validators.required],
      productName: ['', Validators.required],
      batchNumber: ['', Validators.required],
      manufactureDate: [todayIso(), Validators.required],
      expiryDate: [todayIso(), Validators.required],
    },
    { validators: expiryAfterManufactureValidator }
  );

  /** Set once the operator starts the session; captures record against it. */
  readonly session = signal<WeighingSession | null>(null);

  readonly readings = signal<StoredReading[]>([]);
  readonly isSaving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);

  // Void flow: which recent row is being voided, and the reason being typed.
  readonly voidingUuid = signal<string | null>(null);
  voidReason = '';

  readonly connectionState = this.scale.connectionState;
  readonly lastError = this.scale.lastError;
  readonly latestReading = this.scale.latestReading;
  readonly portInfo = this.scale.portInfo;
  readonly isSupported = this.scale.isSupported;

  readonly isConnected = computed(() => this.connectionState() === 'connected');
  readonly isConnecting = computed(() => this.connectionState() === 'connecting');
  readonly isStable = computed(() => this.latestReading()?.stable === true);

  readonly recentCaptures = computed(() => this.readings().slice(0, RECENT_LIMIT));

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

  beginVoid(reading: StoredReading): void {
    this.voidingUuid.set(reading.uuid);
    this.voidReason = '';
  }

  cancelVoid(): void {
    this.voidingUuid.set(null);
  }

  async confirmVoid(): Promise<void> {
    const uuid = this.voidingUuid();
    const reason = this.voidReason.trim();
    if (!uuid || !reason) {
      return;
    }
    try {
      await this.store.voidReading(uuid, reason);
      this.readings.update((readings) => readings.filter((r) => r.uuid !== uuid));
      this.voidingUuid.set(null);
    } catch (err) {
      this.saveError.set(describeSaveError(err));
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
