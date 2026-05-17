import { describe, expect, it } from 'vitest';

import { generateTokenPlaintext, isWellFormedToken, TOKEN_LENGTH } from './tokens.js';

const CROCKFORD = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]+$/;

describe('generateTokenPlaintext', () => {
  it('returns a 26-character Crockford-Base32 string (per D-13)', () => {
    const token = generateTokenPlaintext();
    expect(token).toHaveLength(TOKEN_LENGTH);
    expect(token).toMatch(CROCKFORD);
  });

  it('uses no I/L/O/U characters (Crockford alphabet excludes them)', () => {
    for (let i = 0; i < 200; i++) {
      const token = generateTokenPlaintext();
      expect(token).not.toMatch(/[ILOU]/);
    }
  });

  it('produces unique tokens — no collisions across 10k samples (≥128 bits of entropy per D-13)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      seen.add(generateTokenPlaintext());
    }
    expect(seen.size).toBe(10_000);
  });
});

describe('isWellFormedToken', () => {
  it('accepts a freshly generated token', () => {
    expect(isWellFormedToken(generateTokenPlaintext())).toBe(true);
  });

  it('rejects tokens of the wrong length', () => {
    expect(isWellFormedToken('')).toBe(false);
    expect(isWellFormedToken('0123456789ABCDEFGHJKMNPQRS')).toBe(true);
    expect(isWellFormedToken('0123456789ABCDEFGHJKMNPQR')).toBe(false);
    expect(isWellFormedToken('0123456789ABCDEFGHJKMNPQRST')).toBe(false);
  });

  it('rejects tokens with characters outside the Crockford alphabet', () => {
    expect(isWellFormedToken('I123456789ABCDEFGHJKMNPQRS')).toBe(false);
    expect(isWellFormedToken('L123456789ABCDEFGHJKMNPQRS')).toBe(false);
    expect(isWellFormedToken('O123456789ABCDEFGHJKMNPQRS')).toBe(false);
    expect(isWellFormedToken('U123456789ABCDEFGHJKMNPQRS')).toBe(false);
    expect(isWellFormedToken('a123456789ABCDEFGHJKMNPQRS')).toBe(false);
    expect(isWellFormedToken('0123456789ABCDEFGHJKMNPQR!')).toBe(false);
  });
});
