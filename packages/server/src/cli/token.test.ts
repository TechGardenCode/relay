import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runInit } from './init.js';
import { runTokenCreate, runTokenList, runTokenRevoke } from './token.js';

const DEFAULT_PERSONAS_DIR = resolve(import.meta.dirname, '..', '..', 'personas', 'defaults');

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'relay-cli-token-'));
  runInit({ home, defaultPersonasDir: DEFAULT_PERSONAS_DIR });
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('runTokenCreate', () => {
  it('returns the plaintext + token id; the plaintext is a 26-char Crockford string', () => {
    const result = runTokenCreate('laptop', { home });
    expect(result.plaintext).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
    expect(result.tokenId).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
  });

  it('rejects an empty --device label', () => {
    expect(() => runTokenCreate('', { home })).toThrow(/--device/);
    expect(() => runTokenCreate('   ', { home })).toThrow(/--device/);
  });

  it('persists across successive create calls', () => {
    runTokenCreate('laptop', { home });
    runTokenCreate('phone', { home });
    // The initial token from runInit + two created tokens = 3 total.
    expect(runTokenList({ home })).toHaveLength(3);
  });
});

describe('runTokenList', () => {
  it('lists rows shaped as { id, deviceLabel, createdAt, revokedAt } — no plaintext or hash', () => {
    runTokenCreate('laptop', { home });

    const rows = runTokenList({ home });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['createdAt', 'deviceLabel', 'id', 'revokedAt']);
    }
  });
});

describe('runTokenRevoke', () => {
  it('marks revokedAt on the row and returns { revoked: true }', () => {
    const { tokenId } = runTokenCreate('laptop', { home });
    expect(runTokenRevoke(tokenId, { home })).toEqual({ revoked: true });

    const row = runTokenList({ home }).find((r) => r.id === tokenId);
    expect(row?.revokedAt).not.toBeNull();
  });

  it('returns { revoked: false } for an unknown id', () => {
    expect(runTokenRevoke('01J0000000000000000UNKNOWN', { home })).toEqual({ revoked: false });
  });

  it('rejects an empty id argument', () => {
    expect(() => runTokenRevoke('', { home })).toThrow(/<id>/);
  });
});
