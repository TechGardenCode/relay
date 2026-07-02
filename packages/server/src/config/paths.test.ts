import { describe, expect, it } from 'vitest';

import {
  configPath,
  lastPairingPath,
  relayHome,
  sessionWorkDir,
  sessionsDir,
  tokensPath,
  transcriptPath,
  transcriptsDir,
} from './paths.js';

describe('paths', () => {
  const FAKE_HOME = '/tmp/relay-paths-test-home';

  it('composes ~/.relay/ from the supplied home override', () => {
    expect(relayHome(FAKE_HOME)).toBe('/tmp/relay-paths-test-home/.relay');
  });

  it('places config.yaml directly under ~/.relay/', () => {
    expect(configPath(FAKE_HOME)).toBe('/tmp/relay-paths-test-home/.relay/config.yaml');
  });

  it('places tokens.json directly under ~/.relay/', () => {
    expect(tokensPath(FAKE_HOME)).toBe('/tmp/relay-paths-test-home/.relay/tokens.json');
  });

  it('returns transcripts/ as a directory under ~/.relay/', () => {
    expect(transcriptsDir(FAKE_HOME)).toBe('/tmp/relay-paths-test-home/.relay/transcripts');
  });

  it('composes the per-session transcript sidecar path under transcripts/', () => {
    // Per sqlite-schema.md §2: <sid>.bin under transcripts/, no DB column.
    expect(transcriptPath('01J0SESSION', FAKE_HOME)).toBe(
      '/tmp/relay-paths-test-home/.relay/transcripts/01J0SESSION.bin',
    );
  });

  it('returns sessions/ as a directory under ~/.relay/', () => {
    expect(sessionsDir(FAKE_HOME)).toBe('/tmp/relay-paths-test-home/.relay/sessions');
  });

  it('composes the per-session transient work dir under sessions/', () => {
    // Per ND-12: ~/.relay/sessions/<sid>/.
    expect(sessionWorkDir('01J0SESSION', FAKE_HOME)).toBe(
      '/tmp/relay-paths-test-home/.relay/sessions/01J0SESSION',
    );
  });

  it('places last-pairing.txt directly under ~/.relay/', () => {
    expect(lastPairingPath(FAKE_HOME)).toBe('/tmp/relay-paths-test-home/.relay/last-pairing.txt');
  });

  it('falls back to os.homedir() when no override supplied', () => {
    const path = relayHome();
    expect(path).toMatch(/\/\.relay$/);
    expect(path.length).toBeGreaterThan('/.relay'.length);
  });
});
