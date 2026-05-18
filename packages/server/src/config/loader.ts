// Reads ~/.relay/config.yaml, layers defaults, validates via Zod. Returns the
// resolved RelayConfig consumed by the server boot (6F), the WS claim-lock
// timer (6G, claimLockTimeoutSeconds), and the on-attach replay buffer (6G,
// replayBufferBytes).
//
// Defaults come from prd/03-server.md §5.1 (claimLockTimeoutSeconds=30 per
// ND-01) and §5.2 (replayBufferBytes=32 * 1024 per ND-03). The bind host/port
// defaults match the development convention `127.0.0.1:7777` named in
// docs/deployment.md (loopback-only at MVP — operators bind 0.0.0.0 in
// ~/.relay/config.yaml when remotely accessible).

import { readFileSync } from 'node:fs';

import yaml from 'js-yaml';
import { z } from 'zod';

import { configPath } from './paths.js';

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 7777;
// Per ND-01: single fixed window, no re-arming on activity.
export const DEFAULT_CLAIM_LOCK_TIMEOUT_SECONDS = 30;
// Per ND-03: uniform across sessions; bytes (not lines, not messages).
export const DEFAULT_REPLAY_BUFFER_BYTES = 32 * 1024;

export const RelayConfigSchema = z
  .object({
    host: z.string().default(DEFAULT_HOST),
    port: z.number().int().min(1).max(65535).default(DEFAULT_PORT),
    claimLockTimeoutSeconds: z
      .number()
      .int()
      .positive()
      .default(DEFAULT_CLAIM_LOCK_TIMEOUT_SECONDS),
    replayBufferBytes: z.number().int().positive().default(DEFAULT_REPLAY_BUFFER_BYTES),
  })
  .strict();

export type RelayConfig = z.infer<typeof RelayConfigSchema>;

export interface LoadConfigOptions {
  homeOverride?: string;
  // Direct override of the config path (precedence over homeOverride). Used by
  // `relay server --config <path>` per prd/03-server.md §7.
  configPathOverride?: string;
}

// Missing file → all defaults. Empty file or `null` body → all defaults.
// A populated file with valid keys → those keys override defaults; missing
// keys still fall back to defaults. Unknown top-level keys → validation
// failure (strict schema).
export function loadConfig(opts: LoadConfigOptions = {}): RelayConfig {
  const path = opts.configPathOverride ?? configPath(opts.homeOverride);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return RelayConfigSchema.parse({});
    }
    throw err;
  }
  const parsed = yaml.load(raw);
  if (parsed === null || parsed === undefined) {
    return RelayConfigSchema.parse({});
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`config: ${path} must be a YAML mapping`);
  }
  return RelayConfigSchema.parse(parsed);
}
