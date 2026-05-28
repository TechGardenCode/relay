import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { configPath, lastPairingPath, personasDir, tokensPath } from '../config/paths.js';
import { runInit } from './init.js';

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'relay-cli-init-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('runInit', () => {
  it('scaffolds config.yaml, tokens.json, last-pairing.txt under ~/.relay/', () => {
    const result = runInit({ home });

    expect(existsSync(configPath(home))).toBe(true);
    expect(existsSync(tokensPath(home))).toBe(true);
    expect(existsSync(lastPairingPath(home))).toBe(true);
    expect(result.tokenPlaintext).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/);
  });

  // Per D-17: `relay init` no longer seeds default personas — the persona descope
  // means no user-reachable path exercises personas. The dir stays uncreated.
  it('does NOT create ~/.relay/personas/ or seed any default personas (D-17)', () => {
    runInit({ home });
    expect(existsSync(personasDir(home))).toBe(false);
  });

  it('emits the pairing snippet with relay:// deep link + URL + token (per D-13)', () => {
    const result = runInit({
      home,
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
      url: 'https://relay.example',
    });

    const onDisk = readFileSync(lastPairingPath(home), 'utf8').trimEnd();
    expect(onDisk).toBe(result.pairingSnippet);
  });

  it('emits a next-steps narrative bridge naming login, server start, pair, register, session (per ND-32)', () => {
    const result = runInit({ home });

    // Step 1 must say `claude auth login`, NOT bare `claude login` (the TUI
    // parses the latter as a prompt) — per ND-19's validation-pass fix.
    expect(result.nextSteps).toContain('claude auth login');
    expect(result.nextSteps).not.toMatch(/claude login\b/);
    // ANTHROPIC_API_KEY named as the headless fallback (ND-19), not the default.
    expect(result.nextSteps).toContain('ANTHROPIC_API_KEY');
    expect(result.nextSteps).toContain('relay server');
    expect(result.nextSteps).toContain('Relay: Connect to server');
    expect(result.nextSteps).toContain('relay project add');
    expect(result.nextSteps).toContain('Relay: Start session');
    // Literal repo path to the handbook (accurate on the source-install path).
    expect(result.nextSteps).toContain('docs/guides/getting-started.md');
  });

  it('does NOT persist the next-steps bridge into last-pairing.txt (snippet stays pure pairing payload)', () => {
    const result = runInit({ home });

    const onDisk = readFileSync(lastPairingPath(home), 'utf8');
    expect(onDisk).not.toContain('Next steps:');
    expect(onDisk).not.toContain('claude auth login');
    // The bridge is distinct from the snippet, not appended to it.
    expect(result.nextSteps).not.toBe(result.pairingSnippet);
  });

  it('writes config.yaml and last-pairing.txt with 0600 mode (sensitive — contains pairing token)', () => {
    runInit({ home });

    expect(statSync(configPath(home)).mode & 0o777).toBe(0o600);
    expect(statSync(lastPairingPath(home)).mode & 0o777).toBe(0o600);
  });

  it('refuses to clobber an existing ~/.relay/ on second run', () => {
    runInit({ home });
    expect(() => runInit({ home })).toThrow(/already initialized/);
  });

  it('overwrites when force: true is supplied', () => {
    const first = runInit({ home });
    const second = runInit({
      home,
      force: true,
    });

    expect(second.tokenPlaintext).not.toBe(first.tokenPlaintext);
  });
});
