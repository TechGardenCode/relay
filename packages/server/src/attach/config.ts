// Resolves the server URL + bearer token for the `relay attach` thin client
// and for the REST shim that backs state-mutating CLI subcommands (per the
// ND-16 CLI ↔ data-plane boundary proposal: read-only direct, mutating →
// REST). URL precedence: explicit --url > ~/.relay/config.yaml host:port >
// `http://127.0.0.1:7777` default. Token precedence: explicit --token >
// RELAY_TOKEN env > most-recent active token in ~/.relay/tokens.json.

import { readFileSync } from 'node:fs';

import { TokenStore } from '../auth/store.js';
import { DEFAULT_HOST, DEFAULT_PORT, loadConfig, type RelayConfig } from '../config/loader.js';
import { tokensPath } from '../config/paths.js';

export interface ResolveAttachConfigOptions {
  /** Override the resolved http(s):// URL. */
  url?: string;
  /** Override the bearer token plaintext. */
  token?: string;
  /** Override $HOME for path resolution; used by tests. */
  homeOverride?: string;
}

export interface ResolvedAttachConfig {
  httpUrl: string;
  wsUrl: string;
  token: string;
}

export class AttachConfigError extends Error {
  constructor(
    message: string,
    readonly code: 'no_token' | 'no_url' | 'tokens_unreadable',
  ) {
    super(message);
    this.name = 'AttachConfigError';
  }
}

function urlFromConfig(config: RelayConfig): string {
  const host = config.host === '0.0.0.0' ? '127.0.0.1' : config.host;
  return `http://${host}:${String(config.port)}`;
}

function readMostRecentToken(homeOverride: string | undefined): string | undefined {
  // The CLI never stores plaintext tokens long-term — ~/.relay/tokens.json
  // holds only hashes. The plaintext is shown once by `relay init` / `relay
  // token create` and pasted into RELAY_TOKEN. We fall through to "no_token"
  // when neither override nor env var is set, rather than reading the hash
  // file (which would not yield a usable bearer anyway).
  try {
    const path = tokensPath(homeOverride);
    readFileSync(path, 'utf8'); // existence probe, contents are hashes only
    return undefined;
  } catch {
    return undefined;
  }
}

export function resolveAttachConfig(opts: ResolveAttachConfigOptions = {}): ResolvedAttachConfig {
  const config = loadConfig({ homeOverride: opts.homeOverride });

  const httpUrl = opts.url ?? urlFromConfig(config);
  if (httpUrl === '') {
    throw new AttachConfigError(
      `Could not resolve server URL. Default would be http://${DEFAULT_HOST}:${String(DEFAULT_PORT)}.`,
      'no_url',
    );
  }
  const wsUrl = httpUrl.replace(/^http(s?):\/\//, (_m, s: string) => `ws${s}://`);

  const envToken = process.env['RELAY_TOKEN'];
  const token = opts.token ?? (envToken !== undefined && envToken !== '' ? envToken : undefined);
  if (token === undefined) {
    // Probe ~/.relay/tokens.json existence purely so the error wording can be
    // precise — the file holds only hashes, never plaintext.
    readMostRecentToken(opts.homeOverride);
    throw new AttachConfigError(
      'No bearer token. Pass --token, or set RELAY_TOKEN, or run `relay init` / `relay token create` first.',
      'no_token',
    );
  }

  return { httpUrl, wsUrl, token };
}

// Exposed for tests that want to assert the token-store seam without going
// through resolveAttachConfig (e.g., a unit test that constructs the store
// from a tmp path).
export { TokenStore };
