// Per ND-35, `relay doctor` is the one P0 diagnostics deliverable: a read-only
// probe set that turns the silent-failure class (no credentials, `claude` not
// installed, an unreachable server, a bad token) into an actionable remediation
// line, so a non-author can recover without DMing the author. It is
// deliberately dependency-light — file-existence / writability / parse / PATH /
// credential-presence / HTTP-reachability probes only, no `better-sqlite3` open
// (per ND-18's thin-client posture) and no mutation of ~/.relay/.
//
// Per D-17: the persona-YAML probe was removed with the persona descope.

import { accessSync, constants as fsConstants, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { resolveAttachConfig, AttachConfigError } from '../attach/config.js';
import { loadConfig } from '../config/loader.js';
import { configPath, relayHome, tokensPath } from '../config/paths.js';
import { RELAY_VERSION } from './version.js';

export type DoctorStatus = 'ok' | 'warn' | 'fail';

export interface DoctorCheck {
  name: string;
  status: DoctorStatus;
  detail: string;
  /** Present when the operator can act to clear a `warn`/`fail`. */
  remediation?: string;
}

export interface DoctorReport {
  /** The local `relay` binary version — a header line only; the extension↔server
   *  skew banner stays ND-32 (g) / Track-8 work, not duplicated here. */
  version: string;
  checks: DoctorCheck[];
  /** False when any probe FAILs (WARNs do not fail the run). Drives the exit code. */
  ok: boolean;
}

/** Outcome of the authenticated server reachability probe. */
export type ServerProbeResult = 'ok' | 'bad_token' | 'unreachable' | 'no_token';

export interface DoctorDeps {
  /** Override $HOME for path resolution; tests pass a tmp dir. */
  home?: string;
  /** Process environment to read `ANTHROPIC_API_KEY` from. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Host platform; selects the OAuth-credential probe shape. Defaults to `process.platform`. */
  platform?: NodeJS.Platform;
  /** The local `relay` version for the report header. Defaults to the CLI's version. */
  version?: string;
  /** Whether the `claude` binary resolves on PATH. Injected in tests. */
  claudeOnPath?: () => boolean;
  /** Whether the `claude login` OAuth credential surface is present. Injected in tests. */
  oauthCredentialPresent?: (platform: NodeJS.Platform, home: string | undefined) => boolean;
  /** Authenticated server reachability + token-validity probe. Injected in tests. */
  probeServer?: (home: string | undefined) => Promise<ServerProbeResult>;
}

function defaultClaudeOnPath(): boolean {
  try {
    // `--version` is cheap and does not make a network call or touch credentials.
    execFileSync('claude', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Per ND-19, the OAuth credential surface is the macOS Keychain
// (`Claude Code-credentials` generic password) or `~/.claude/.credentials.json`
// on Linux. This is a *presence* probe — it never reads or returns the value.
function defaultOauthCredentialPresent(
  platform: NodeJS.Platform,
  home: string | undefined,
): boolean {
  if (platform === 'darwin') {
    try {
      execFileSync('security', ['find-generic-password', '-s', 'Claude Code-credentials'], {
        stdio: 'ignore',
      });
      return true;
    } catch {
      return false;
    }
  }
  // Linux / other: the credentials file under the OS home.
  const base = home ?? process.env.HOME ?? '';
  return existsSync(join(base, '.claude', '.credentials.json'));
}

async function defaultProbeServer(home: string | undefined): Promise<ServerProbeResult> {
  let config: { httpUrl: string; token: string };
  try {
    config = resolveAttachConfig({ homeOverride: home });
  } catch (err) {
    if (err instanceof AttachConfigError && err.code === 'no_token') return 'no_token';
    // A missing URL or unreadable tokens file is also "can't probe with a token".
    if (err instanceof AttachConfigError) return 'no_token';
    throw err;
  }
  const base = config.httpUrl.replace(/\/$/, '');
  try {
    // Any HTTP response proves reachability; 401 means the token is rejected.
    // `/tenants` is an authenticated route per prd/03-server.md §2.
    const res = await fetch(`${base}/tenants`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json' },
    });
    return res.status === 401 ? 'bad_token' : 'ok';
  } catch {
    return 'unreachable';
  }
}

export async function runDoctor(deps: DoctorDeps = {}): Promise<DoctorReport> {
  const home = deps.home;
  const env = deps.env ?? process.env;
  const platform = deps.platform ?? process.platform;
  const version = deps.version ?? RELAY_VERSION;
  const claudeOnPath = deps.claudeOnPath ?? defaultClaudeOnPath;
  const oauthCredentialPresent = deps.oauthCredentialPresent ?? defaultOauthCredentialPresent;
  const probeServer = deps.probeServer ?? defaultProbeServer;

  const checks: DoctorCheck[] = [];

  // 1. relay-home: ~/.relay/config.yaml present and parseable.
  if (!existsSync(configPath(home))) {
    checks.push({
      name: 'relay-home',
      status: 'fail',
      detail: `no config at ${configPath(home)}`,
      remediation: 'run `relay init` to scaffold ~/.relay/',
    });
  } else {
    try {
      loadConfig({ homeOverride: home });
      checks.push({ name: 'relay-home', status: 'ok', detail: `config at ${configPath(home)}` });
    } catch (err) {
      checks.push({
        name: 'relay-home',
        status: 'fail',
        detail: `config.yaml does not parse: ${(err as Error).message}`,
        remediation: 'fix the YAML in ~/.relay/config.yaml or re-run `relay init --force`',
      });
    }
  }

  // 2. tokens: a token store exists (init mints the initial token).
  if (existsSync(tokensPath(home))) {
    checks.push({ name: 'tokens', status: 'ok', detail: `token store at ${tokensPath(home)}` });
  } else {
    checks.push({
      name: 'tokens',
      status: 'fail',
      detail: 'no token store at ~/.relay/tokens.json',
      remediation: 'run `relay init`, or `relay token create --device <name>`',
    });
  }

  // 3. claude-binary: the agent CLI Relay spawns must resolve on PATH.
  if (claudeOnPath()) {
    checks.push({ name: 'claude-binary', status: 'ok', detail: '`claude` resolves on PATH' });
  } else {
    checks.push({
      name: 'claude-binary',
      status: 'fail',
      detail: '`claude` not found on PATH',
      remediation:
        'install Claude Code and ensure `claude` is on the PATH of the user that runs `relay server`',
    });
  }

  // 4. credentials: present via either ND-19 path (env var OR OAuth surface).
  //    Presence only — a set-but-invalid value still surfaces at the agent.
  if (typeof env.ANTHROPIC_API_KEY === 'string' && env.ANTHROPIC_API_KEY !== '') {
    checks.push({
      name: 'credentials',
      status: 'ok',
      detail: 'present via ANTHROPIC_API_KEY (headless fallback)',
    });
  } else if (oauthCredentialPresent(platform, home)) {
    checks.push({
      name: 'credentials',
      status: 'ok',
      detail:
        platform === 'darwin'
          ? 'present via `claude login` OAuth (macOS Keychain)'
          : 'present via `claude login` OAuth (~/.claude/.credentials.json)',
    });
  } else {
    checks.push({
      name: 'credentials',
      status: 'fail',
      detail:
        'no Claude credentials found (neither ANTHROPIC_API_KEY nor a `claude login` session)',
      remediation: 'run `claude auth login`, or set ANTHROPIC_API_KEY for headless use',
    });
  }

  // Per D-17: the personas probe was removed with the persona descope.

  // 5. storage: ~/.relay/ is writable (DB + transcripts + transient dirs live here).
  try {
    accessSync(relayHome(home), fsConstants.W_OK);
    checks.push({ name: 'storage', status: 'ok', detail: `${relayHome(home)} is writable` });
  } catch {
    checks.push({
      name: 'storage',
      status: 'fail',
      detail: `${relayHome(home)} is missing or not writable`,
      remediation: 'run `relay init`, or fix directory permissions for the server user',
    });
  }

  // 6. server: reachable with a valid token. WARN on unreachable (doctor is
  //    usually run while the server is down) / no-token; FAIL only on 401.
  const serverResult = await probeServer(home);
  switch (serverResult) {
    case 'ok':
      checks.push({ name: 'server', status: 'ok', detail: 'reachable and the token is accepted' });
      break;
    case 'bad_token':
      checks.push({
        name: 'server',
        status: 'fail',
        detail: 'server reachable but the token was rejected (401)',
        remediation: 'mint a fresh token with `relay token create` and re-pair, or set RELAY_TOKEN',
      });
      break;
    case 'unreachable':
      checks.push({
        name: 'server',
        status: 'warn',
        detail: 'could not reach the server',
        remediation: 'start it with `relay server` (skip this check if it is meant to be down)',
      });
      break;
    case 'no_token':
      checks.push({
        name: 'server',
        status: 'warn',
        detail: 'no token available to probe server auth',
        remediation: 'set RELAY_TOKEN (or pass --token) to probe server reachability + auth',
      });
      break;
  }

  const ok = !checks.some((c) => c.status === 'fail');
  return { version, checks, ok };
}
