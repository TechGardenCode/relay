import { describe, expect, it } from 'vitest';

import { hashToken, verifyTokenHash } from './hash.js';
import { generateTokenPlaintext } from './tokens.js';

describe('hashToken (ND-09 — salted SHA-256, 16-byte per-token salt)', () => {
  it('returns base64-encoded salt and hash', () => {
    const result = hashToken('plaintext');
    // 16-byte salt → 24 chars base64 with padding.
    expect(Buffer.from(result.saltB64, 'base64')).toHaveLength(16);
    // SHA-256 → 32 bytes → 44 chars base64 with padding.
    expect(Buffer.from(result.hashB64, 'base64')).toHaveLength(32);
  });

  it('produces a different salt on each call (rainbow-table resistance per ND-09)', () => {
    const a = hashToken('plaintext');
    const b = hashToken('plaintext');
    expect(a.saltB64).not.toBe(b.saltB64);
    // Different salt → different hash even with identical plaintext.
    expect(a.hashB64).not.toBe(b.hashB64);
  });
});

describe('verifyTokenHash', () => {
  it('verifies the correct plaintext against its own hash', () => {
    const token = generateTokenPlaintext();
    const { saltB64, hashB64 } = hashToken(token);
    expect(verifyTokenHash(token, saltB64, hashB64)).toBe(true);
  });

  it('rejects a different plaintext against the same hash', () => {
    const a = generateTokenPlaintext();
    const b = generateTokenPlaintext();
    const { saltB64, hashB64 } = hashToken(a);
    expect(verifyTokenHash(b, saltB64, hashB64)).toBe(false);
  });

  it('rejects when the salt has been tampered with', () => {
    const token = generateTokenPlaintext();
    const { hashB64 } = hashToken(token);
    // Different salt → different hash; verify must fail.
    const differentSaltB64 = hashToken(token).saltB64;
    expect(verifyTokenHash(token, differentSaltB64, hashB64)).toBe(false);
  });

  it('rejects gracefully when the stored hash length is wrong (defense in depth)', () => {
    const token = generateTokenPlaintext();
    const { saltB64 } = hashToken(token);
    // 31-byte stored hash (one byte short of SHA-256).
    const shortHashB64 = Buffer.alloc(31).toString('base64');
    expect(verifyTokenHash(token, saltB64, shortHashB64)).toBe(false);
  });
});
