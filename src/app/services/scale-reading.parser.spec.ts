import { LineBreakTransformer, StabilityTracker, parseWeightLine } from './scale-reading.parser';

describe('parseWeightLine', () => {
  it('parses A&D / Mettler-style stable frames', () => {
    const r = parseWeightLine('ST,GS,+   12.345 g');
    expect(r.value).toBe(12.345);
    expect(r.unit).toBe('g');
    expect(r.stable).toBeTrue();
  });

  it('parses unstable (US) frames', () => {
    const r = parseWeightLine('US,GS,+   12.340 g');
    expect(r.value).toBe(12.34);
    expect(r.stable).toBeFalse();
  });

  it('parses bare Ultima-style numbers with no unit or flag', () => {
    const r = parseWeightLine('056.600');
    expect(r.value).toBe(56.6);
    expect(r.unit).toBeNull();
    expect(r.stable).toBeNull();
  });

  it('parses compact signed frames like +00012.34g', () => {
    const r = parseWeightLine('+00012.34g');
    expect(r.value).toBe(12.34);
    expect(r.unit).toBe('g');
  });

  it('parses negative values (below-tare)', () => {
    expect(parseWeightLine('-0.005 g').value).toBe(-0.005);
  });

  it('recognises mg/kg/lb/oz units case-insensitively', () => {
    expect(parseWeightLine('12 MG').unit).toBe('mg');
    expect(parseWeightLine('1.2 Kg').unit).toBe('kg');
    expect(parseWeightLine('2 lb').unit).toBe('lb');
    expect(parseWeightLine('3 oz').unit).toBe('oz');
  });

  it('returns null value for lines with no number', () => {
    const r = parseWeightLine('ERR: overload');
    expect(r.value).toBeNull();
    expect(r.raw).toBe('ERR: overload');
  });
});

describe('StabilityTracker', () => {
  it('reports stable only after the value repeats the sample count', () => {
    const tracker = new StabilityTracker(3);
    expect(tracker.update(56.6)).toBeFalse();
    expect(tracker.update(56.6)).toBeFalse();
    expect(tracker.update(56.6)).toBeTrue();
  });

  it('resets the streak when the value moves beyond epsilon', () => {
    const tracker = new StabilityTracker(3);
    tracker.update(56.6);
    tracker.update(56.6);
    expect(tracker.update(57.1)).toBeFalse(); // streak broken
    tracker.update(57.1);
    expect(tracker.update(57.1)).toBeTrue();
  });

  it('tolerates jitter within epsilon', () => {
    const tracker = new StabilityTracker(3, 0.01);
    tracker.update(56.6);
    tracker.update(56.601);
    expect(tracker.update(56.599)).toBeTrue();
  });

  it('returns null and resets on unparseable readings', () => {
    const tracker = new StabilityTracker(3);
    tracker.update(56.6);
    tracker.update(56.6);
    expect(tracker.update(null)).toBeNull();
    expect(tracker.update(56.6)).toBeFalse(); // streak restarted
  });
});

describe('LineBreakTransformer', () => {
  function collect(chunks: string[]): string[] {
    const out: string[] = [];
    const controller = {
      enqueue: (line: string) => {
        out.push(line);
      },
    } as unknown as TransformStreamDefaultController<string>;
    const t = new LineBreakTransformer();
    for (const chunk of chunks) {
      t.transform(chunk, controller);
    }
    t.flush(controller);
    return out;
  }

  it('splits on CRLF and buffers partial lines across chunks', () => {
    expect(collect(['056.6', '00\r\n057.', '100\r\n'])).toEqual(['056.600', '057.100']);
  });

  it('handles bare LF and flushes a trailing partial line', () => {
    expect(collect(['a\nb\nc'])).toEqual(['a', 'b', 'c']);
  });
});
