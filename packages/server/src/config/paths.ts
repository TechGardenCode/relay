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

export function tokensPath(homeOverride?: string): string {
  return join(relayHome(homeOverride), 'tokens.json');
}

export function personasDir(homeOverride?: string): string {
  return join(relayHome(homeOverride), 'personas');
}

export function projectPersonasDir(canonicalProjectPath: string): string {
  return join(canonicalProjectPath, RELAY_DIR, 'personas');
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

export function lastPairingPath(homeOverride?: string): string {
  return join(relayHome(homeOverride), 'last-pairing.txt');
}
