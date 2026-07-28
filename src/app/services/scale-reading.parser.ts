// Pure parsing + stability logic for scale serial output, kept free of any
// Web Serial / Angular dependency so it can be unit-tested without a device.
// ScaleSerialService owns the port; this module owns interpreting the bytes.

export interface WeightReading {
  raw: string;
  value: number | null;
  unit: string | null;
  stable: boolean | null;
  timestamp: number;
}

export const DEFAULT_UNIT = 'g';

// Splits an incoming text stream into lines on \r, \n, or \r\n.
export class LineBreakTransformer implements Transformer<string, string> {
  private buffer = '';

  transform(chunk: string, controller: TransformStreamDefaultController<string>): void {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      controller.enqueue(line);
    }
  }

  flush(controller: TransformStreamDefaultController<string>): void {
    if (this.buffer) {
      controller.enqueue(this.buffer);
      this.buffer = '';
    }
  }
}

// Best-effort parser covering common lab/pharma balance serial formats, e.g.
// A&D / Mettler-style "ST,GS,+   12.345 g" or plain "+00012.34g" strings.
// Balances that emit a different layout will still show the raw line so the
// format can be adjusted here later.
//
// The Ultima RS232 output seen in practice is just a bare number (e.g.
// "056.600") with no unit and no ST/US stability flag, so those two fields
// fall back to defaults/heuristics applied by the caller (see DEFAULT_UNIT
// and StabilityTracker) whenever the line itself doesn't specify them.
export function parseWeightLine(raw: string): WeightReading {
  const stable = /\bUS\b/.test(raw) ? false : /\bST\b/.test(raw) ? true : null;
  const match = raw.match(/([+-]?\d+(?:\.\d+)?)\s*(mg|kg|g|lb|oz)?/i);

  return {
    raw,
    value: match ? parseFloat(match[1]) : null,
    unit: match?.[2]?.toLowerCase() ?? null,
    stable,
    timestamp: Date.now(),
  };
}

// Steadiness-based stability fallback for devices (e.g. Ultima) that never
// send an explicit ST/US flag: a reading counts as stable once the same value
// has repeated `sampleCount` times in a row (within `epsilon`).
export class StabilityTracker {
  private lastValue: number | null = null;
  private repeats = 0;

  constructor(
    private readonly sampleCount = 3,
    private readonly epsilon = 0.0005,
  ) {}

  update(value: number | null): boolean | null {
    if (value === null) {
      this.reset();
      return null;
    }
    if (this.lastValue !== null && Math.abs(value - this.lastValue) < this.epsilon) {
      this.repeats++;
    } else {
      this.lastValue = value;
      this.repeats = 1;
    }
    return this.repeats >= this.sampleCount;
  }

  reset(): void {
    this.lastValue = null;
    this.repeats = 0;
  }
}
