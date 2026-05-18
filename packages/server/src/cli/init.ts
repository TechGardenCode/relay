import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dump as yamlDump } from 'js-yaml';

import {
  configPath,
  lastPairingPath,
  personasDir,
  relayHome,
  tokensPath,
} from '../config/paths.js';
import { TokenStore } from '../auth/store.js';

// Defaults mirror config/loader.ts so the file init scaffolds is the
// canonical-shape document loadConfig() reads. Per ND-01 (30 s) / ND-03
// (32 KB) and docs/deployment.md (7777). 127.0.0.1 keeps the local-dev
// default loopback-only; Docker / reverse-proxy operators override `host`
// in ~/.relay/config.yaml.
const DEFAULT_LISTEN_PORT = 7777;
const DEFAULT_LISTEN_HOST = '127.0.0.1';
const DEFAULT_CLAIM_LOCK_TIMEOUT_SECONDS = 30;
const DEFAULT_REPLAY_BUFFER_BYTES = 32768;
const INITIAL_TOKEN_LABEL = 'initial';

const cliDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PERSONAS_DIR = resolve(cliDir, '..', '..', 'personas', 'defaults');

export interface InitOptions {
  home?: string;
  url?: string;
  defaultPersonasDir?: string;
  /** When false, abort if ~/.relay/ already contains config/tokens. Defaults to false. */
  force?: boolean;
}

export interface InitResult {
  tokenPlaintext: string;
  serverUrl: string;
  pairingSnippet: string;
  alreadyInitialized: boolean;
}

export function runInit(opts: InitOptions = {}): InitResult {
  const home = opts.home;
  const sourcePersonasDir = opts.defaultPersonasDir ?? DEFAULT_PERSONAS_DIR;
  const serverUrl = opts.url ?? `http://${DEFAULT_LISTEN_HOST}:${String(DEFAULT_LISTEN_PORT)}`;

  const home_ = relayHome(home);
  const force = opts.force ?? false;
  if (!force && (existsSync(configPath(home)) || existsSync(tokensPath(home)))) {
    throw new Error(
      `relay init: ~/.relay/ already initialized at ${home_}. Pass --force to re-run.`,
    );
  }

  mkdirSync(home_, { recursive: true });
  writeConfig(home);
  copyDefaultPersonas(sourcePersonasDir, personasDir(home));

  const store = new TokenStore(tokensPath(home));
  const created = store.createToken(INITIAL_TOKEN_LABEL);
  const snippet = buildPairingSnippet(serverUrl, created.plaintext);
  writeFileSync(lastPairingPath(home), snippet + '\n', { mode: 0o600 });

  return {
    tokenPlaintext: created.plaintext,
    serverUrl,
    pairingSnippet: snippet,
    alreadyInitialized: false,
  };
}

function writeConfig(home: string | undefined): void {
  // Flat shape; matches the RelayConfigSchema in config/loader.ts. Keys here
  // are exactly the ones loadConfig() accepts — strict mode rejects extras
  // (including `schemaVersion` and `listen` nesting), so adding a key here
  // means adding it to RelayConfigSchema first.
  const config = {
    host: DEFAULT_LISTEN_HOST,
    port: DEFAULT_LISTEN_PORT,
    claimLockTimeoutSeconds: DEFAULT_CLAIM_LOCK_TIMEOUT_SECONDS,
    replayBufferBytes: DEFAULT_REPLAY_BUFFER_BYTES,
  };
  writeFileSync(configPath(home), yamlDump(config), { mode: 0o600 });
}

function copyDefaultPersonas(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  let entries: string[];
  try {
    entries = readdirSync(sourceDir);
  } catch (err) {
    throw new Error(
      `relay init: default personas dir not found at ${sourceDir}: ${(err as Error).message}`,
    );
  }
  for (const filename of entries) {
    if (!filename.endsWith('.yaml')) continue;
    copyFileSync(join(sourceDir, filename), join(targetDir, filename));
  }
}

function buildPairingSnippet(serverUrl: string, tokenPlaintext: string): string {
  return [
    'Relay is ready. Pair your IDE extension by pasting this:',
    `    relay://pair?url=${encodeURIComponent(serverUrl)}&token=${tokenPlaintext}`,
    'Or by URL + token separately:',
    `    Server URL: ${serverUrl}`,
    `    Token:      ${tokenPlaintext}`,
  ].join('\n');
}
