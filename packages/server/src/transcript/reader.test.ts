import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import * as fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readRange } from './reader.js';
import { MAX_RANGE_LIMIT_BYTES } from './types.js';

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'relay-transcript-reader-'));
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

function writeFixture(bytes: Buffer): string {
  const filePath = join(workdir, `${Math.random().toString(36).slice(2)}.bin`);
  writeFileSync(filePath, bytes);
  return filePath;
}

describe('readRange — ND-04 contract', () => {
  it('returns the half-open range [max(0, before - limit), before)', async () => {
    const file = Buffer.from('abcdefghij'); // 10 bytes
    const filePath = writeFixture(file);

    const result = await readRange({ filePath, before: 10, limit: 4, totalBytes: 10 });
    expect(result.from).toBe(6);
    expect(result.to).toBe(10);
    expect(result.bytes.toString('utf8')).toBe('ghij');
    expect(result.hasMore).toBe(true);
  });

  it('exclusive upper bound — the byte at offset `before` is NOT returned', async () => {
    const file = Buffer.from('abcdefghij');
    const filePath = writeFixture(file);

    const result = await readRange({ filePath, before: 5, limit: 5, totalBytes: 10 });
    expect(result.bytes.toString('utf8')).toBe('abcde');
    // The byte at file[5] is 'f' — must not appear in this response.
    expect(result.bytes.includes(0x66)).toBe(false);
  });

  it('before === 0 is the terminal call: returns empty + hasMore: false', async () => {
    const filePath = writeFixture(Buffer.from('abcdefghij'));
    const result = await readRange({ filePath, before: 0, limit: 100, totalBytes: 10 });
    expect(result).toEqual({ from: 0, to: 0, bytes: Buffer.alloc(0), hasMore: false });
  });

  it('hasMore reflects (from > 0)', async () => {
    const file = Buffer.from('abcdefghij');
    const filePath = writeFixture(file);

    const allRead = await readRange({ filePath, before: 10, limit: 100, totalBytes: 10 });
    expect(allRead.from).toBe(0);
    expect(allRead.hasMore).toBe(false);

    const partial = await readRange({ filePath, before: 10, limit: 3, totalBytes: 10 });
    expect(partial.from).toBe(7);
    expect(partial.hasMore).toBe(true);
  });

  it('silently clamps limit to MAX_RANGE_LIMIT_BYTES', async () => {
    const total = MAX_RANGE_LIMIT_BYTES + 100;
    const file = randomBytes(total);
    const filePath = writeFixture(file);

    const result = await readRange({
      filePath,
      before: total,
      limit: MAX_RANGE_LIMIT_BYTES * 4,
      totalBytes: total,
    });
    expect(result.to - result.from).toBe(MAX_RANGE_LIMIT_BYTES);
    expect(result.from).toBe(total - MAX_RANGE_LIMIT_BYTES);
    // Response shape doesn't carry a "clamped" flag — clamp is silent per ND-04 rule 2.
    expect(Object.keys(result).sort()).toEqual(['bytes', 'from', 'hasMore', 'to']);
  });

  it('throws on before > totalBytes (caller bug)', async () => {
    const filePath = writeFixture(Buffer.from('abc'));
    await expect(readRange({ filePath, before: 5, limit: 10, totalBytes: 3 })).rejects.toThrow(
      /past totalBytes/,
    );
  });

  it('throws on negative or non-integer before', async () => {
    const filePath = writeFixture(Buffer.from('abc'));
    await expect(readRange({ filePath, before: -1, limit: 1, totalBytes: 3 })).rejects.toThrow(
      /non-negative integer/,
    );
    await expect(readRange({ filePath, before: 1.5, limit: 1, totalBytes: 3 })).rejects.toThrow(
      /non-negative integer/,
    );
  });

  it('throws on limit <= 0', async () => {
    const filePath = writeFixture(Buffer.from('abc'));
    await expect(readRange({ filePath, before: 1, limit: 0, totalBytes: 3 })).rejects.toThrow(
      /positive integer/,
    );
    await expect(readRange({ filePath, before: 1, limit: -5, totalBytes: 3 })).rejects.toThrow(
      /positive integer/,
    );
  });
});

describe('readRange — fast-check property tests', () => {
  // Generators are scoped to keep test runs fast; the property targets are
  // half-open boundary math, tile invariants, byte fidelity, and silent clamp.

  it('property 1 — half-open width equals min(limit, MAX, before)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 4096 }),
        fc.integer({ min: 1, max: 8192 }),
        async (total, limit) => {
          const file = randomBytes(total);
          const filePath = writeFixture(file);
          // Pick `before` ∈ (0, total].
          const before = total;
          const result = await readRange({ filePath, before, limit, totalBytes: total });
          const expectedWidth = Math.min(limit, MAX_RANGE_LIMIT_BYTES, before);
          expect(result.to - result.from).toBe(expectedWidth);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('property 2 — backward-walk tiles [0, totalBytes) exactly with no overlap', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 4096 }),
        fc.integer({ min: 1, max: 1024 }),
        async (total, limit) => {
          const file = randomBytes(total);
          const filePath = writeFixture(file);
          const chunks: Buffer[] = [];
          let before = total;
          // Bound the loop defensively; tile must terminate when before === 0.
          for (let i = 0; i < total + 5; i += 1) {
            const r = await readRange({ filePath, before, limit, totalBytes: total });
            chunks.push(r.bytes);
            if (!r.hasMore) {
              expect(r.from).toBe(0);
              break;
            }
            // Each call returns exactly `limit` bytes when it has more.
            expect(r.to - r.from).toBe(Math.min(limit, MAX_RANGE_LIMIT_BYTES));
            before = r.from;
          }
          // Concatenate in forward order (chunks were pushed in reverse).
          const recovered = Buffer.concat(chunks.reverse());
          expect(recovered.equals(file)).toBe(true);
        },
      ),
      { numRuns: 25 },
    );
  });

  it('property 3 — bytes exactly equal file.subarray(from, to)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 2048 }), async (total) => {
        const file = randomBytes(total);
        const filePath = writeFixture(file);

        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 1, max: total }),
            fc.integer({ min: 1, max: total * 2 + 16 }),
            async (before, limit) => {
              const r = await readRange({ filePath, before, limit, totalBytes: total });
              expect(r.bytes.equals(file.subarray(r.from, r.to))).toBe(true);
            },
          ),
          { numRuns: 5 },
        );
      }),
      { numRuns: 10 },
    );
  });

  it('property 4 — hasMore === (from > 0)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1024 }),
        fc.integer({ min: 1, max: 2048 }),
        async (total, limit) => {
          const file = randomBytes(total);
          const filePath = writeFixture(file);
          const r = await readRange({ filePath, before: total, limit, totalBytes: total });
          expect(r.hasMore).toBe(r.from > 0);
        },
      ),
      { numRuns: 30 },
    );
  });
});
