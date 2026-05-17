import { randomBytes } from 'node:crypto';

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createRingBuffer } from './ring-buffer.js';

describe('createRingBuffer — basics', () => {
  it('rejects non-positive capacity', () => {
    expect(() => createRingBuffer(0)).toThrow(/positive integer/);
    expect(() => createRingBuffer(-1)).toThrow(/positive integer/);
    expect(() => createRingBuffer(1.5)).toThrow(/positive integer/);
  });

  it('empty buffer before any push', () => {
    const rb = createRingBuffer(16);
    expect(rb.snapshot().length).toBe(0);
  });

  it('push then snapshot returns chronological bytes within capacity', () => {
    const rb = createRingBuffer(16);
    rb.push(Buffer.from('hello'));
    expect(rb.snapshot().toString('utf8')).toBe('hello');
  });

  it('snapshot length never exceeds capacity', () => {
    const rb = createRingBuffer(8);
    rb.push(Buffer.from('abcdefghij')); // 10 > 8
    expect(rb.snapshot().length).toBe(8);
    // Per ND-03: oldest bytes overwrite. Tail wins.
    expect(rb.snapshot().toString('utf8')).toBe('cdefghij');
  });

  it('wrap mid-capacity preserves chronological order', () => {
    const rb = createRingBuffer(6);
    rb.push(Buffer.from('abcd')); // [a b c d _ _], writeIdx=4
    rb.push(Buffer.from('efgh')); // [g h c d e f], writeIdx=2, filled
    expect(rb.snapshot().toString('utf8')).toBe('cdefgh');
  });

  it('snapshot returns an independent copy (mutation safety)', () => {
    const rb = createRingBuffer(8);
    rb.push(Buffer.from('hello'));
    const s1 = rb.snapshot();
    s1[0] = 0x00;
    const s2 = rb.snapshot();
    expect(s2.toString('utf8')).toBe('hello');
  });

  it('empty push is a no-op', () => {
    const rb = createRingBuffer(8);
    rb.push(Buffer.from('hi'));
    rb.push(Buffer.alloc(0));
    expect(rb.snapshot().toString('utf8')).toBe('hi');
  });

  it('chunk exactly capacity-sized fills the buffer', () => {
    const rb = createRingBuffer(4);
    rb.push(Buffer.from('abcd'));
    expect(rb.snapshot().toString('utf8')).toBe('abcd');
    rb.push(Buffer.from('XY'));
    expect(rb.snapshot().toString('utf8')).toBe('cdXY');
  });
});

describe('createRingBuffer — fast-check properties', () => {
  // Generator: a sequence of byte chunks (0..256 bytes each).
  const chunksArb = fc.array(fc.uint8Array({ minLength: 0, maxLength: 256 }), {
    minLength: 0,
    maxLength: 30,
  });
  const capacityArb = fc.constantFrom(1, 4, 16, 64, 1024, 32 * 1024);

  it('property A — snapshot length ≤ capacity always', () => {
    fc.assert(
      fc.property(capacityArb, chunksArb, (cap, chunks) => {
        const rb = createRingBuffer(cap);
        for (const c of chunks) rb.push(Buffer.from(c));
        expect(rb.snapshot().length).toBeLessThanOrEqual(cap);
      }),
      { numRuns: 200 },
    );
  });

  it('property B — tail invariant: snapshot equals last min(total, capacity) bytes of concatenation', () => {
    fc.assert(
      fc.property(capacityArb, chunksArb, (cap, chunks) => {
        const rb = createRingBuffer(cap);
        const parts: Buffer[] = [];
        for (const c of chunks) {
          const b = Buffer.from(c);
          rb.push(b);
          parts.push(b);
        }
        const all = Buffer.concat(parts);
        const expected = all.subarray(Math.max(0, all.length - cap));
        expect(rb.snapshot().equals(expected)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('property C — idempotent snapshots', () => {
    fc.assert(
      fc.property(capacityArb, chunksArb, (cap, chunks) => {
        const rb = createRingBuffer(cap);
        for (const c of chunks) rb.push(Buffer.from(c));
        expect(rb.snapshot().equals(rb.snapshot())).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('property D — independence: mutating one snapshot does not affect the next', () => {
    fc.assert(
      fc.property(capacityArb, chunksArb, (cap, chunks) => {
        const rb = createRingBuffer(cap);
        for (const c of chunks) rb.push(Buffer.from(c));
        const s1 = rb.snapshot();
        const s1Original = Buffer.from(s1); // copy
        for (let i = 0; i < s1.length; i += 1) s1[i] = 0;
        const s2 = rb.snapshot();
        expect(s2.equals(s1Original)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('property E — handles random binary bytes (non-utf8) without transformation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4096 }),
        fc.integer({ min: 1, max: 8192 }),
        (cap, total) => {
          const rb = createRingBuffer(cap);
          const data = randomBytes(total);
          rb.push(data);
          const expected = data.subarray(Math.max(0, total - cap));
          expect(rb.snapshot().equals(expected)).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });
});
