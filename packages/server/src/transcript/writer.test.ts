import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createWriter } from './writer.js';

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'relay-transcript-writer-'));
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe('createWriter — append-only sidecar', () => {
  it('writes chunks in order and updates bytesWritten', () => {
    const filePath = join(workdir, 'sid.bin');
    const w = createWriter({ filePath });

    w.append(Buffer.from('hello'));
    expect(w.bytesWritten).toBe(5);

    w.append(Buffer.from(' world'));
    expect(w.bytesWritten).toBe(11);

    expect(readFileSync(filePath, 'utf8')).toBe('hello world');
  });

  it('opens with O_APPEND so a fresh writer appends to existing content', async () => {
    const filePath = join(workdir, 'sid.bin');
    const first = createWriter({ filePath });
    first.append(Buffer.from('one\n'));
    await first.close();

    const second = createWriter({ filePath });
    // bytesWritten starts at zero per writer — it tracks bytes this writer
    // contributed, not the file size. Per ND-04, sessions.total_bytes is the
    // authoritative cumulative counter.
    expect(second.bytesWritten).toBe(0);
    second.append(Buffer.from('two\n'));
    await second.close();

    expect(readFileSync(filePath, 'utf8')).toBe('one\ntwo\n');
  });

  it('writes mode 0o600 (privacy parity with auth/tokens.json)', () => {
    if (platform() === 'win32') return; // Windows doesn't honor POSIX mode bits.
    const filePath = join(workdir, 'sid.bin');
    const w = createWriter({ filePath });
    w.append(Buffer.from('x'));
    const mode = statSync(filePath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('handles empty appends as a no-op', () => {
    const filePath = join(workdir, 'sid.bin');
    const w = createWriter({ filePath });
    w.append(Buffer.alloc(0));
    expect(w.bytesWritten).toBe(0);
    expect(readFileSync(filePath).length).toBe(0);
  });

  it('throws on append after close', async () => {
    const filePath = join(workdir, 'sid.bin');
    const w = createWriter({ filePath });
    await w.close();
    expect(() => w.append(Buffer.from('x'))).toThrow(/append after close/);
  });

  it('close is idempotent', async () => {
    const filePath = join(workdir, 'sid.bin');
    const w = createWriter({ filePath });
    w.append(Buffer.from('x'));
    await w.close();
    await expect(w.close()).resolves.toBeUndefined();
  });

  it('creates the parent directory if it does not exist', () => {
    const filePath = join(workdir, 'nested', 'deeper', 'sid.bin');
    const w = createWriter({ filePath });
    w.append(Buffer.from('x'));
    expect(readFileSync(filePath, 'utf8')).toBe('x');
  });

  it('handles binary (non-utf8) bytes without transformation', () => {
    const filePath = join(workdir, 'sid.bin');
    const w = createWriter({ filePath });
    const bytes = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x7f, 0x80]);
    w.append(bytes);
    expect(readFileSync(filePath).equals(bytes)).toBe(true);
  });
});
