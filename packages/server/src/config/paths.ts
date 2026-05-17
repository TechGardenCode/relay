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

export function transcriptsDir(homeOverride?: string): string {
  return join(relayHome(homeOverride), 'transcripts');
}

export function sessionsDir(homeOverride?: string): string {
  return join(relayHome(homeOverride), 'sessions');
}

export function lastPairingPath(homeOverride?: string): string {
  return join(relayHome(homeOverride), 'last-pairing.txt');
}
