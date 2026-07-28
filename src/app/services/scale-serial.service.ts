import { Injectable, signal } from '@angular/core';
import { KNOWN_SCALE_DEVICE } from './scale-device.config';
import {
  DEFAULT_UNIT,
  LineBreakTransformer,
  StabilityTracker,
  parseWeightLine,
  type WeightReading,
} from './scale-reading.parser';

export type { WeightReading } from './scale-reading.parser';

export interface SerialConnectionOptions extends Partial<SerialOptions> {
  baudRate: number;
}

export type SerialConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

const DEFAULT_OPTIONS: SerialConnectionOptions = {
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
};

@Injectable({ providedIn: 'root' })
export class ScaleSerialService {
  readonly isSupported = typeof navigator !== 'undefined' && 'serial' in navigator;

  readonly connectionState = signal<SerialConnectionState>('disconnected');
  readonly lastError = signal<string | null>(null);
  readonly latestReading = signal<WeightReading | null>(null);
  readonly portInfo = signal<SerialPortInfo | null>(null);

  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private readableClosed: Promise<void> | null = null;
  private keepReading = false;

  // Continuous-mode noise repeats the same line back-to-back with no gap;
  // a manual PRINT press stands alone after a pause. Logging on value-change
  // OR after a quiet gap surfaces real print events without flooding on noise.
  private static readonly LOG_GAP_MS = 800;
  private lastLoggedLine: string | null = null;
  private lastLineAt = 0;

  private readonly stability = new StabilityTracker();

  // Auto-reconnect: after a successful connect, a cable glitch should heal
  // itself when the device reappears. Manual Disconnect turns this off.
  private lastOptions: Partial<SerialConnectionOptions> = {};
  private autoReconnect = false;

  constructor() {
    if (this.isSupported) {
      navigator.serial.addEventListener('disconnect', (event) => this.onPortLost(event));
      navigator.serial.addEventListener('connect', () => void this.onPortBack());
    }
  }

  async connect(options: Partial<SerialConnectionOptions> = {}): Promise<void> {
    if (!this.isSupported) {
      this.lastError.set('Web Serial API is not supported in this browser. Use Chrome or Edge over HTTPS/localhost.');
      this.connectionState.set('error');
      return;
    }

    this.connectionState.set('connecting');
    this.lastError.set(null);

    try {
      const port = await this.pickPort();
      if (!port) {
        this.connectionState.set('disconnected');
        return;
      }
      const merged: SerialConnectionOptions = { ...DEFAULT_OPTIONS, ...options };
      await port.open(merged);

      this.port = port;
      this.portInfo.set(port.getInfo());
      this.connectionState.set('connected');
      this.lastOptions = options;
      this.autoReconnect = true;
      void this.startReading();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        // User closed the port picker without selecting a device.
        this.connectionState.set('disconnected');
        return;
      }
      this.lastError.set(this.describeError(err));
      this.connectionState.set('error');
    }
  }

  // Reuses a port the user already granted permission for (no picker dialog)
  // whenever it matches KNOWN_SCALE_DEVICE, or is the only authorized port.
  // Otherwise falls back to requestPort(), which the browser requires to be
  // triggered by a user gesture the first time a device is paired.
  private async pickPort(): Promise<SerialPort | null> {
    const authorized = await navigator.serial.getPorts();
    const known = KNOWN_SCALE_DEVICE;

    if (known) {
      const match = authorized.find((p: SerialPort) => {
        const info = p.getInfo();
        return (
          (known.usbVendorId === undefined || info.usbVendorId === known.usbVendorId) &&
          (known.usbProductId === undefined || info.usbProductId === known.usbProductId)
        );
      });
      if (match) {
        return match;
      }
    } else if (authorized.length === 1) {
      return authorized[0];
    }

    try {
      const filters = KNOWN_SCALE_DEVICE ? [KNOWN_SCALE_DEVICE] : undefined;
      return await navigator.serial.requestPort(filters ? { filters } : undefined);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        return null;
      }
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.autoReconnect = false; // operator chose to disconnect — stay down
    await this.teardown();
  }

  private async teardown(): Promise<void> {
    this.keepReading = false;
    try {
      await this.reader?.cancel();
    } catch {
      // Reader may already be released by a prior teardown.
    }
    await this.readableClosed?.catch(() => undefined);
    try {
      await this.port?.close();
    } catch {
      // Ignore close errors during teardown.
    }
    this.port = null;
    this.reader = null;
    this.connectionState.set('disconnected');
    this.portInfo.set(null);
    // Clear the display too — a frozen last weight on a dead connection is
    // exactly the number someone would mistakenly trust.
    this.latestReading.set(null);
    this.stability.reset();
  }

  /** The active port physically vanished (cable pulled, scale powered off). */
  private onPortLost(event: Event): void {
    if (this.port && event.target === this.port) {
      void this.teardown();
    }
  }

  /** A serial device (re)appeared — heal the session if we own one. */
  private async onPortBack(): Promise<void> {
    if (this.autoReconnect && this.connectionState() !== 'connected') {
      await this.connect(this.lastOptions);
    }
  }

  private async startReading(): Promise<void> {
    if (!this.port?.readable) {
      return;
    }
    this.keepReading = true;

    const textDecoder = new TextDecoderStream();
    this.readableClosed = this.port.readable
      .pipeTo(textDecoder.writable as unknown as WritableStream<Uint8Array>)
      .catch(() => undefined);
    const lineStream = textDecoder.readable.pipeThrough(new TransformStream(new LineBreakTransformer()));
    this.reader = lineStream.getReader();

    while (this.keepReading) {
      let result: ReadableStreamReadResult<string>;
      try {
        result = await this.reader.read();
      } catch (err) {
        this.lastError.set(this.describeError(err));
        this.connectionState.set('error');
        break;
      }
      if (result.done) {
        break;
      }
      if (result.value) {
        this.handleLine(result.value);
      }
    }
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    const now = Date.now();
    const gapSinceLastLine = now - this.lastLineAt;
    this.lastLineAt = now;

    const valueChanged = trimmed !== this.lastLoggedLine;
    const isFreshBurst = gapSinceLastLine > ScaleSerialService.LOG_GAP_MS;

    if (valueChanged || isFreshBurst) {
      console.log(`[scale-serial] raw line @ ${new Date().toLocaleTimeString()}:`, trimmed);
      this.lastLoggedLine = trimmed;
    }

    const parsed = parseWeightLine(trimmed);
    this.latestReading.set({
      ...parsed,
      unit: parsed.unit ?? DEFAULT_UNIT,
      stable: parsed.stable ?? this.stability.update(parsed.value),
    });
  }

  private describeError(err: unknown): string {
    return err instanceof Error ? err.message : 'Unknown serial port error.';
  }
}
