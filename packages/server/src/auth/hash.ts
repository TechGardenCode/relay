import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Per ND-09: salted SHA-256 with a 16-byte per-token random salt is sufficient
// for ≥128-bit-entropy tokens. Slow KDFs (argon2id, scrypt) defend low-entropy
// human credentials against offline brute-force — not the threat for high-
// entropy random secrets.
const SALT_BYTES = 16;
const HASH_BYTES = 32;

export interface HashResult {
  saltB64: string;
  hashB64: string;
}

export function hashToken(plaintext: string): HashResult {
  const salt = randomBytes(SALT_BYTES);
  const hash = computeHash(salt, plaintext);
  return { saltB64: salt.toString('base64'), hashB64: hash.toString('base64') };
}

export function verifyTokenHash(plaintext: string, saltB64: string, hashB64: string): boolean {
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, 'base64');
    expected = Buffer.from(hashB64, 'base64');
  } catch {
    return false;
  }
  if (expected.length !== HASH_BYTES) return false;
  const actual = computeHash(salt, plaintext);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function computeHash(salt: Buffer, plaintext: string): Buffer {
  return createHash('sha256').update(salt).update(plaintext, 'utf8').digest();
}
