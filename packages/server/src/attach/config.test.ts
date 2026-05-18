// resolveAttachConfig — URL precedence, token precedence, error wording.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AttachConfigError, resolveAttachConfig } from './config.js';

let home: string;
let savedEnvToken: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'relay-attach-config-'));
  mkdirSync(join(home, '.relay'), { recursive: true });
  savedEnvToken = process.env['RELAY_TOKEN'];
  delete process.env['RELAY_TOKEN'];
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  if (savedEnvToken === undefined) {
    delete process.env['RELAY_TOKEN'];
  } else {
    process.env['RELAY_TOKEN'] = savedEnvToken;
  }
});

describe('resolveAttachConfig URL', () => {
  it('defaults to http://127.0.0.1:7777 when config.yaml is absent', () => {
    const cfg = resolveAttachConfig({ token: 'T', homeOverride: home });
    expect(cfg.httpUrl).toBe('http://127.0.0.1:7777');
    expect(cfg.wsUrl).toBe('ws://127.0.0.1:7777');
  });

  it('reads host:port from ~/.relay/config.yaml', () => {
    writeFileSync(join(home, '.relay', 'config.yaml'), 'host: 10.0.0.5\nport: 8080\n');
    const cfg = resolveAttachConfig({ token: 'T', homeOverride: home });
    expect(cfg.httpUrl).toBe('http://10.0.0.5:8080');
    expect(cfg.wsUrl).toBe('ws://10.0.0.5:8080');
  });

  it('rewrites 0.0.0.0 to 127.0.0.1 for the client connection (operators bind 0.0.0.0; clients connect loopback)', () => {
    writeFileSync(join(home, '.relay', 'config.yaml'), 'host: 0.0.0.0\nport: 9001\n');
    const cfg = resolveAttachConfig({ token: 'T', homeOverride: home });
    expect(cfg.httpUrl).toBe('http://127.0.0.1:9001');
  });

  it('the explicit --url override beats config.yaml', () => {
    writeFileSync(join(home, '.relay', 'config.yaml'), 'host: 10.0.0.5\nport: 8080\n');
    const cfg = resolveAttachConfig({
      url: 'https://relay.example.com',
      token: 'T',
      homeOverride: home,
    });
    expect(cfg.httpUrl).toBe('https://relay.example.com');
    expect(cfg.wsUrl).toBe('wss://relay.example.com');
  });
});

describe('resolveAttachConfig token', () => {
  it('reads RELAY_TOKEN from the environment when --token is absent', () => {
    process.env['RELAY_TOKEN'] = 'ENV_TOKEN';
    const cfg = resolveAttachConfig({ homeOverride: home });
    expect(cfg.token).toBe('ENV_TOKEN');
  });

  it('the explicit --token override beats RELAY_TOKEN', () => {
    process.env['RELAY_TOKEN'] = 'ENV_TOKEN';
    const cfg = resolveAttachConfig({ token: 'EXPLICIT', homeOverride: home });
    expect(cfg.token).toBe('EXPLICIT');
  });

  it('throws AttachConfigError with code=no_token when neither --token nor RELAY_TOKEN is set', () => {
    expect(() => resolveAttachConfig({ homeOverride: home })).toThrow(AttachConfigError);
    try {
      resolveAttachConfig({ homeOverride: home });
    } catch (err) {
      expect((err as AttachConfigError).code).toBe('no_token');
    }
  });
});
