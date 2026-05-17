import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';

import { monotonicFactory } from 'ulid';

import { hashToken, verifyTokenHash } from './hash.js';
import { RevocationBus } from './events.js';
import { generateTokenPlaintext, isWellFormedToken } from './tokens.js';

// File mode 0600: tokens.json is owner-read-write only. Even though tokens are
// hashed (ND-09), the file is sensitive — a writable file could be poisoned
// with an attacker-known hash.
const FILE_MODE = 0o600;
const ulid = monotonicFactory();

export interface TokenRecord {
  id: string;
  deviceLabel: string;
  saltB64: string;
  hashB64: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface TokenView {
  id: string;
  deviceLabel: string;
  createdAt: string;
  revokedAt: string | null;
}

export type VerifyResult =
  | { ok: true; tokenId: string }
  | { ok: false; reason: 'unknown' | 'revoked' | 'malformed' };

interface TokensFile {
  tokens: TokenRecord[];
}

export interface CreatedToken {
  plaintext: string;
  record: TokenRecord;
}

export class TokenStore {
  readonly bus: RevocationBus;

  constructor(
    private readonly filePath: string,
    bus: RevocationBus = new RevocationBus(),
  ) {
    this.bus = bus;
  }

  createToken(deviceLabel: string): CreatedToken {
    const plaintext = generateTokenPlaintext();
    const { saltB64, hashB64 } = hashToken(plaintext);
    const record: TokenRecord = {
      id: ulid(),
      deviceLabel,
      saltB64,
      hashB64,
      createdAt: nowIso(),
      revokedAt: null,
    };
    const file = this.read();
    file.tokens.push(record);
    this.write(file);
    return { plaintext, record };
  }

  verify(plaintext: string): VerifyResult {
    if (!isWellFormedToken(plaintext)) {
      return { ok: false, reason: 'malformed' };
    }
    const file = this.read();
    for (const record of file.tokens) {
      if (verifyTokenHash(plaintext, record.saltB64, record.hashB64)) {
        if (record.revokedAt !== null) {
          return { ok: false, reason: 'revoked' };
        }
        return { ok: true, tokenId: record.id };
      }
    }
    return { ok: false, reason: 'unknown' };
  }

  revoke(tokenId: string): boolean {
    const file = this.read();
    const record = file.tokens.find((t) => t.id === tokenId);
    if (record === undefined) return false;
    if (record.revokedAt !== null) return false;
    record.revokedAt = nowIso();
    this.write(file);
    this.bus.emitRevocation({
      tokenId: record.id,
      revokedAt: record.revokedAt,
    });
    return true;
  }

  list(): TokenView[] {
    const file = this.read();
    return file.tokens.map(toView);
  }

  private read(): TokensFile {
    let raw: string;
    try {
      raw = readFileSync(this.filePath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { tokens: [] };
      }
      throw err;
    }
    if (raw.trim() === '') return { tokens: [] };
    const parsed = JSON.parse(raw) as unknown;
    return normalize(parsed);
  }

  private write(file: TokensFile): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    const fd = openSync(tmp, 'w', FILE_MODE);
    try {
      writeSync(fd, JSON.stringify(file, null, 2) + '\n');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, this.filePath);
  }
}

function toView(record: TokenRecord): TokenView {
  return {
    id: record.id,
    deviceLabel: record.deviceLabel,
    createdAt: record.createdAt,
    revokedAt: record.revokedAt,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalize(parsed: unknown): TokensFile {
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { tokens?: unknown }).tokens)
  ) {
    throw new Error('tokens.json: malformed file (missing `tokens` array)');
  }
  const tokens = (parsed as { tokens: unknown[] }).tokens.map((raw, index): TokenRecord => {
    if (
      typeof raw !== 'object' ||
      raw === null ||
      typeof (raw as TokenRecord).id !== 'string' ||
      typeof (raw as TokenRecord).deviceLabel !== 'string' ||
      typeof (raw as TokenRecord).saltB64 !== 'string' ||
      typeof (raw as TokenRecord).hashB64 !== 'string' ||
      typeof (raw as TokenRecord).createdAt !== 'string' ||
      ((raw as TokenRecord).revokedAt !== null &&
        typeof (raw as TokenRecord).revokedAt !== 'string')
    ) {
      throw new Error(`tokens.json: malformed record at index ${String(index)}`);
    }
    return raw as TokenRecord;
  });
  return { tokens };
}
