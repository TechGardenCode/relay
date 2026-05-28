import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { dump as yamlDump } from 'js-yaml';

import { configPath, dbPath, lastPairingPath, relayHome, tokensPath } from '../config/paths.js';
import { TokenStore } from '../auth/store.js';
import { openDatabase, runMigrations, tenants } from '../store/index.js';

import { resolveMigrationsDir } from './migrations-dir.js';

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

export interface InitOptions {
  home?: string;
  url?: string;
  /** Test seam: override the migrations directory. Production resolves it next to dist/cli/. */
  migrationsDir?: string;
  /** When false, abort if ~/.relay/ already contains config/tokens. Defaults to false. */
  force?: boolean;
}

export interface InitResult {
  tokenPlaintext: string;
  serverUrl: string;
  pairingSnippet: string;
  /**
   * Per ND-32, the onboarding narrative bridge: a numbered next-steps block
   * printed to stdout after the pairing snippet so a non-author knows the
   * sequence (`claude auth login` → `relay server` → IDE pair → register
   * project → start session) without reading the source tree. Ephemeral
   * console guidance — deliberately NOT persisted to last-pairing.txt, which
   * stays the pure pairing payload the operator re-reads for the token.
   */
  nextSteps: string;
  alreadyInitialized: boolean;
}

export function runInit(opts: InitOptions = {}): InitResult {
  const home = opts.home;
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
  // Per D-17: `relay init` no longer seeds default personas — personas are
  // descoped from MVP. ~/.relay/personas/ is left uncreated; the default YAMLs
  // stay dormant in the package for the Phase-2 re-enable.

  // Migrate the DB so direct-read CLIs (`relay project list`, `relay session
  // list`) work immediately after init, without requiring a prior `relay
  // server` start. This is the same boot sequence initServer (6E) runs.
  const migrationsDir = opts.migrationsDir ?? resolveMigrationsDir(import.meta.url);
  const db = openDatabase({ filename: dbPath(home) });
  try {
    runMigrations(db, migrationsDir);
    tenants.ensureSingleton(db, Date.now());
  } finally {
    db.close();
  }

  const store = new TokenStore(tokensPath(home));
  const created = store.createToken(INITIAL_TOKEN_LABEL);
  const snippet = buildPairingSnippet(serverUrl, created.plaintext);
  writeFileSync(lastPairingPath(home), snippet + '\n', { mode: 0o600 });

  return {
    tokenPlaintext: created.plaintext,
    serverUrl,
    pairingSnippet: snippet,
    nextSteps: buildNextSteps(),
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

function buildPairingSnippet(serverUrl: string, tokenPlaintext: string): string {
  return [
    'Relay is ready. Pair your IDE extension by pasting this:',
    `    relay://pair?url=${encodeURIComponent(serverUrl)}&token=${tokenPlaintext}`,
    'Or by URL + token separately:',
    `    Server URL: ${serverUrl}`,
    `    Token:      ${tokenPlaintext}`,
  ].join('\n');
}

// Per ND-32, `relay init` is self-narrating: D-13 fixed the pairing snippet
// shape but left the operator at "I have a token, now what?". This block names
// the remaining steps so a non-author reaches a running session without
// reading the source tree. Step 1 uses `claude auth login` (not bare `claude
// login`, which the TUI parses as a prompt) and names the ANTHROPIC_API_KEY
// fallback per ND-19; the credential-*validation* mechanism is ND-35, not here.
function buildNextSteps(): string {
  return [
    'Next steps:',
    '  1. Make sure Claude Code is logged in on this machine:',
    '         claude auth login          # spawned agents inherit this login',
    '     Headless / CI? Set ANTHROPIC_API_KEY instead — see docs/deployment.md.',
    '  2. Start the Relay server (leave it running):',
    '         relay server',
    '  3. In your IDE, run "Relay: Connect to server" and paste the snippet above.',
    '  4. Register a project: open it in your IDE → "Relay: Register this workspace',
    '     as a project" (or from the CLI: relay project add <path>).',
    '  5. Start a session: "Relay: Start session in current project".',
    '',
    'Full walkthrough: docs/guides/getting-started.md',
  ].join('\n');
}
