import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RevocationBus, type RevocationEvent } from './events.js';
import { TokenStore } from './store.js';

let workdir: string;
let tokensFile: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'relay-auth-store-'));
  tokensFile = join(workdir, 'tokens.json');
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe('TokenStore.createToken', () => {
  it('returns a Crockford-Base32 plaintext + a record with id/deviceLabel/timestamps', () => {
    const store = new TokenStore(tokensFile);
    const { plaintext, record } = store.createToken('laptop');

    expect(plaintext).toHaveLength(26);
    expect(plaintext).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]+$/);
    expect(record.deviceLabel).toBe('laptop');
    expect(record.id).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
    expect(record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(record.revokedAt).toBeNull();
    expect(record.hashB64).toBeTruthy();
    expect(record.saltB64).toBeTruthy();
  });

  it('persists across new TokenStore instances pointing at the same file', () => {
    const a = new TokenStore(tokensFile);
    const created = a.createToken('laptop');
    const b = new TokenStore(tokensFile);

    expect(b.list().map((r) => r.id)).toEqual([created.record.id]);
  });

  it('writes tokens.json with 0600 file mode (sensitive even though hashed per ND-09 + threat-model §4)', () => {
    const store = new TokenStore(tokensFile);
    store.createToken('laptop');

    const mode = statSync(tokensFile).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

describe('TokenStore.verify', () => {
  it("returns { ok: true, tokenId } for the issued token's plaintext", () => {
    const store = new TokenStore(tokensFile);
    const { plaintext, record } = store.createToken('laptop');

    expect(store.verify(plaintext)).toEqual({ ok: true, tokenId: record.id });
  });

  it("returns { ok: false, reason: 'unknown' } for a well-formed but unknown token", () => {
    const store = new TokenStore(tokensFile);
    store.createToken('laptop');

    // A different well-formed Crockford token — astronomically unlikely to collide.
    expect(store.verify('ZZZZZZZZZZZZZZZZZZZZZZZZZZ')).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it("returns { ok: false, reason: 'malformed' } for non-Crockford or wrong-length input", () => {
    const store = new TokenStore(tokensFile);
    expect(store.verify('not-a-token')).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(store.verify('I123456789ABCDEFGHJKMNPQRS')).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it("returns { ok: false, reason: 'revoked' } once the token has been revoked (per D-13)", () => {
    const store = new TokenStore(tokensFile);
    const { plaintext, record } = store.createToken('laptop');
    store.revoke(record.id);

    expect(store.verify(plaintext)).toEqual({
      ok: false,
      reason: 'revoked',
    });
  });
});

describe('TokenStore.revoke', () => {
  it('sets revokedAt on the row and returns true', () => {
    const store = new TokenStore(tokensFile);
    const { record } = store.createToken('laptop');

    expect(store.revoke(record.id)).toBe(true);
    const after = store.list().find((r) => r.id === record.id);
    expect(after?.revokedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns false for an unknown id', () => {
    const store = new TokenStore(tokensFile);
    expect(store.revoke('01J0000000000000000UNKNOWN')).toBe(false);
  });

  it('returns false when called twice on the same id (no double-revoke)', () => {
    const store = new TokenStore(tokensFile);
    const { record } = store.createToken('laptop');
    expect(store.revoke(record.id)).toBe(true);
    expect(store.revoke(record.id)).toBe(false);
  });

  it('emits a revocation event for the WS handler (6G) to consume (per D-13 + ws-protocol.md §auth_expired)', () => {
    const bus = new RevocationBus();
    const events: RevocationEvent[] = [];
    bus.onRevocation((e) => events.push(e));

    const store = new TokenStore(tokensFile, bus);
    const { record } = store.createToken('laptop');
    store.revoke(record.id);

    expect(events).toHaveLength(1);
    expect(events[0]?.tokenId).toBe(record.id);
    expect(events[0]?.revokedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does not emit a revocation event when revoke is a no-op', () => {
    const bus = new RevocationBus();
    const events: RevocationEvent[] = [];
    bus.onRevocation((e) => events.push(e));

    const store = new TokenStore(tokensFile, bus);
    store.revoke('01J0000000000000000UNKNOWN');

    expect(events).toHaveLength(0);
  });
});

describe('TokenStore.list', () => {
  it('returns only view fields (no plaintext, no hash, no salt) per threat-model §4', () => {
    const store = new TokenStore(tokensFile);
    store.createToken('laptop');
    store.createToken('phone');

    const rows = store.list();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['createdAt', 'deviceLabel', 'id', 'revokedAt']);
    }
  });

  it('returns rows including revoked ones (operator visibility into revocation state)', () => {
    const store = new TokenStore(tokensFile);
    const { record: r1 } = store.createToken('laptop');
    store.createToken('phone');
    store.revoke(r1.id);

    const rows = store.list();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === r1.id)?.revokedAt).not.toBeNull();
  });
});

describe('TokenStore — corrupt file handling', () => {
  it('throws a descriptive error when tokens.json is malformed', () => {
    writeFileSync(tokensFile, '{"tokens": "not-an-array"}');
    const store = new TokenStore(tokensFile);
    expect(() => store.list()).toThrow(/tokens\.json/);
  });

  it('treats an empty file as no tokens (graceful first-run recovery)', () => {
    writeFileSync(tokensFile, '');
    const store = new TokenStore(tokensFile);
    expect(store.list()).toEqual([]);
  });
});

describe('TokenStore — file content shape', () => {
  it('writes records that round-trip through JSON.parse and contain the expected fields', () => {
    const store = new TokenStore(tokensFile);
    store.createToken('laptop');

    const raw = readFileSync(tokensFile, 'utf8');
    const parsed = JSON.parse(raw) as { tokens: Array<Record<string, unknown>> };
    expect(parsed.tokens).toHaveLength(1);
    const row = parsed.tokens[0]!;
    expect(Object.keys(row).sort()).toEqual([
      'createdAt',
      'deviceLabel',
      'hashB64',
      'id',
      'revokedAt',
      'saltB64',
    ]);
  });
});
