import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_CLAIM_LOCK_TIMEOUT_SECONDS,
  DEFAULT_HOST,
  DEFAULT_PORT,
  DEFAULT_REPLAY_BUFFER_BYTES,
  loadConfig,
} from './loader.js';

describe('loadConfig', () => {
  let homeOverride: string;

  beforeEach(() => {
    homeOverride = mkdtempSync(join(tmpdir(), 'relay-config-loader-'));
  });

  afterEach(() => {
    rmSync(homeOverride, { recursive: true, force: true });
  });

  function writeYaml(body: string): void {
    const relayDir = join(homeOverride, '.relay');
    mkdirSync(relayDir, { recursive: true });
    writeFileSync(join(relayDir, 'config.yaml'), body);
  }

  it('returns defaults when the config file is missing', () => {
    const cfg = loadConfig({ homeOverride });
    expect(cfg).toEqual({
      host: DEFAULT_HOST,
      port: DEFAULT_PORT,
      claimLockTimeoutSeconds: DEFAULT_CLAIM_LOCK_TIMEOUT_SECONDS,
      replayBufferBytes: DEFAULT_REPLAY_BUFFER_BYTES,
    });
  });

  it('returns defaults for an empty config file', () => {
    writeYaml('');
    const cfg = loadConfig({ homeOverride });
    expect(cfg.host).toBe(DEFAULT_HOST);
    expect(cfg.port).toBe(DEFAULT_PORT);
  });

  it('overrides individual keys; leaves the rest at defaults', () => {
    writeYaml('port: 9090\n');
    const cfg = loadConfig({ homeOverride });
    expect(cfg.port).toBe(9090);
    expect(cfg.host).toBe(DEFAULT_HOST);
    expect(cfg.claimLockTimeoutSeconds).toBe(DEFAULT_CLAIM_LOCK_TIMEOUT_SECONDS);
  });

  it('accepts a fully-specified config', () => {
    writeYaml(
      [
        'host: 0.0.0.0',
        'port: 8080',
        'claimLockTimeoutSeconds: 60',
        'replayBufferBytes: 65536',
      ].join('\n'),
    );
    const cfg = loadConfig({ homeOverride });
    expect(cfg).toEqual({
      host: '0.0.0.0',
      port: 8080,
      claimLockTimeoutSeconds: 60,
      replayBufferBytes: 65536,
    });
  });

  it('rejects an unknown top-level key (strict schema catches typos)', () => {
    writeYaml('claimlocktimeoutseconds: 60\n');
    expect(() => loadConfig({ homeOverride })).toThrow();
  });

  it('rejects out-of-range port', () => {
    writeYaml('port: 99999\n');
    expect(() => loadConfig({ homeOverride })).toThrow();
  });

  it('rejects non-mapping YAML body', () => {
    writeYaml('- not\n- a\n- mapping\n');
    expect(() => loadConfig({ homeOverride })).toThrow(/must be a YAML mapping/);
  });

  it('honors configPathOverride above homeOverride', () => {
    const explicit = join(homeOverride, 'custom-config.yaml');
    writeFileSync(explicit, 'port: 5555\n');
    const cfg = loadConfig({ homeOverride, configPathOverride: explicit });
    expect(cfg.port).toBe(5555);
  });
});
