import { randomBytes } from 'node:crypto';

// Per D-13 (prd/03-server.md §6): bearer tokens are 26-character Crockford-Base32
// strings carrying ≥128 bits of entropy. The Crockford alphabet excludes I, L, O,
// U to avoid visual collision with 1/0 and accidental profanity.
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const TOKEN_LENGTH = 26;

const VALID_CHAR = new Set(CROCKFORD_ALPHABET);

export function generateTokenPlaintext(): string {
  // 26 chars × 5 bits/char = 130 bits → ≥128 per D-13. We pull 17 random bytes
  // (136 bits) and consume 5-bit groups MSB-first; the trailing 6 bits are
  // discarded.
  const bytes = randomBytes(17);
  const chars: string[] = [];
  let bitBuffer = 0;
  let bitsAvailable = 0;
  let byteIndex = 0;
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    while (bitsAvailable < 5) {
      const next = bytes[byteIndex++];
      if (next === undefined) {
        throw new Error('generateTokenPlaintext: ran out of random bytes');
      }
      bitBuffer = (bitBuffer << 8) | next;
      bitsAvailable += 8;
    }
    bitsAvailable -= 5;
    const value = (bitBuffer >> bitsAvailable) & 0b11111;
    chars.push(CROCKFORD_ALPHABET[value]!);
  }
  return chars.join('');
}

export function isWellFormedToken(plaintext: string): boolean {
  if (plaintext.length !== TOKEN_LENGTH) return false;
  for (let i = 0; i < plaintext.length; i++) {
    if (!VALID_CHAR.has(plaintext[i]!)) return false;
  }
  return true;
}
