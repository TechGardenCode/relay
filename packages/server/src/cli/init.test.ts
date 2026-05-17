import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { configPath, lastPairingPath, personasDir, tokensPath } from '../config/paths.js';
import { runInit } from './init.js';

const DEFAULT_PERSONAS_DIR = resolve(import.meta.dirname, '..', '..', 'personas', 'defaults');

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'relay-cli-init-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('runInit', () => {
  it('scaffolds config.yaml, tokens.json, personas/, last-pairing.txt under ~/.relay/', () => {
    const result = runInit({ home, defaultPersonasDir: DEFAULT_PERSONAS_DIR });

    expect(existsSync(configPath(home))).toBe(true);
    expect(existsSync(tokensPath(home))).toBe(true);
    expect(existsSync(personasDir(home))).toBe(true);
    expect(existsSync(lastPairingPath(home))).toBe(true);
    expect(result.tokenPlaintext).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
  });

  it('copies the seven default personas from packages/server/personas/defaults/', () => {
    runInit({ home, defaultPersonasDir: DEFAULT_PERSONAS_DIR });

    const dir = personasDir(home);
    const expected = [
      'architect.yaml',
      'design.yaml',
      'dev.yaml',
      'infra.yaml',
      'product.yaml',
      'review.yaml',
      'test.yaml',
    ];
    for (const name of expected) {
      expect(existsSync(join(dir, name))).toBe(true);
    }
  });

  it('emits the pairing snippet with relay:// deep link + URL + token (per D-13)', () => {
    const result = runInit({
      home,
      defaultPersonasDir: DEFAULT_PERSONAS_DIR,
      url: 'https://relay.example',
    });

    expect(result.serverUrl).toBe('https://relay.example');
    expect(result.pairingSnippet).toContain(
      `relay://pair?url=${encodeURIComponent('https://relay.example')}&token=${result.tokenPlaintext}`,
    );
    expect(result.pairingSnippet).toContain('Server URL: https://relay.example');
    expect(result.pairingSnippet).toContain(`Token:      ${result.tokenPlaintext}`);
  });

  it('writes the pairing snippet verbatim into ~/.relay/last-pairing.txt', () => {
    const result = runInit({
      home,
      defaultPersonasDir: DEFAULT_PERSONAS_DIR,
      url: 'https://relay.example',
    });

    const onDisk = readFileSync(lastPairingPath(home), 'utf8').trimEnd();
    expect(onDisk).toBe(result.pairingSnippet);
  });

  it('writes config.yaml and last-pairing.txt with 0600 mode (sensitive — contains pairing token)', () => {
    runInit({ home, defaultPersonasDir: DEFAULT_PERSONAS_DIR });

    expect(statSync(configPath(home)).mode & 0o777).toBe(0o600);
    expect(statSync(lastPairingPath(home)).mode & 0o777).toBe(0o600);
  });

  it('refuses to clobber an existing ~/.relay/ on second run', () => {
    runInit({ home, defaultPersonasDir: DEFAULT_PERSONAS_DIR });
    expect(() => runInit({ home, defaultPersonasDir: DEFAULT_PERSONAS_DIR })).toThrow(
      /already initialized/,
    );
  });

  it('overwrites when force: true is supplied', () => {
    const first = runInit({ home, defaultPersonasDir: DEFAULT_PERSONAS_DIR });
    const second = runInit({
      home,
      defaultPersonasDir: DEFAULT_PERSONAS_DIR,
      force: true,
    });

    expect(second.tokenPlaintext).not.toBe(first.tokenPlaintext);
  });
});
