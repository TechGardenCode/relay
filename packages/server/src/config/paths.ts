import { homedir } from 'node:os';
import { join } from 'node:path';

const RELAY_DIR = '.relay';

function home(override?: string): string {
  return override ?? homedir();
}

export function relayHome(homeOverride?: string): string {
  return join(home(homeOverride), RELAY_DIR);
}

export function configPath(homeOverride?: string): string {
  return join(relayHome(homeOverride), 'config.yaml');
}

// `relay server` opens this for persistence; tests use ':memory:' instead.
export function dbPath(homeOverride?: string): string {
  return join(relayHome(homeOverride), 'relay.db');
}

export function tokensPath(homeOverride?: string): string {
  return join(relayHome(homeOverride), 'tokens.json');
}

export function transcriptsDir(homeOverride?: string): string {
  return join(relayHome(homeOverride), 'transcripts');
}

// Per sqlite-schema.md §2: transcripts are sidecar files at
// `~/.relay/transcripts/<sid>.bin`; no `transcript_path` column on `sessions`.
// The path is computed from the session id at read/write time.
export function transcriptPath(sid: string, homeOverride?: string): string {
  return join(transcriptsDir(homeOverride), `${sid}.bin`);
}

export function sessionsDir(homeOverride?: string): string {
  return join(relayHome(homeOverride), 'sessions');
}

// Per ND-12: each session gets a transient scratch dir at
// `~/.relay/sessions/<sid>/` holding `spawn.json`. Owner-only at 0o700;
// spawn.json at 0o600.
export function sessionWorkDir(sid: string, homeOverride?: string): string {
  return join(sessionsDir(homeOverride), sid);
}

export function lastPairingPath(homeOverride?: string): string {
  return join(relayHome(homeOverride), 'last-pairing.txt');
}
