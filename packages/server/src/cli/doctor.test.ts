import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runInit } from './init.js';
import { type DoctorDeps, runDoctor } from './doctor.js';

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'relay-cli-doctor-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

// All probe seams that would touch the host (PATH, Keychain, network) are
// injected so the suite is deterministic and offline. The default `home` is a
// freshly `runInit`'d scaffold so the relay-home/config/tokens/storage probes
// hit real (tmp) files.
function goodDeps(overrides: Partial<DoctorDeps> = {}): DoctorDeps {
  return {
    home,
    env: {},
    platform: 'linux',
    claudeOnPath: () => true,
    oauthCredentialPresent: () => true,
    probeServer: () => Promise.resolve('ok'),
    nativeAddonsLoad: () => ({ ok: true, failed: [] }),
    ...overrides,
  };
}

function seedHome(): void {
  runInit({ home });
}

function findCheck(checks: { name: string }[], name: string) {
  const c = checks.find((x) => x.name === name);
  if (c === undefined) throw new Error(`no check named ${name}`);
  return c as { name: string; status: string; detail: string; remediation?: string };
}

describe('runDoctor', () => {
  it('reports every probe OK on a fully-configured home and is overall ok', async () => {
    seedHome();
    const report = await runDoctor(goodDeps());

    expect(report.ok).toBe(true);
    for (const check of report.checks) {
      expect(check.status, `${check.name} should be ok`).toBe('ok');
    }
    // The probe set the bar names must all be present.
    const names = report.checks.map((c) => c.name);
    // Per D-17: the 'personas' probe was removed with the persona descope.
    expect(names).toEqual(
      expect.arrayContaining([
        'relay-home',
        'tokens',
        'claude-binary',
        'credentials',
        'storage',
        'server',
      ]),
    );
    expect(names).not.toContain('personas');
  });

  it('FAILs relay-home with a `relay init` remediation when ~/.relay is missing', async () => {
    // No seedHome(): the tmp dir has no ~/.relay scaffold.
    const report = await runDoctor(goodDeps());

    const check = findCheck(report.checks, 'relay-home');
    expect(check.status).toBe('fail');
    expect(check.remediation).toContain('relay init');
    expect(report.ok).toBe(false);
  });

  it('accepts ANTHROPIC_API_KEY as the credential surface (ND-19 fallback path)', async () => {
    seedHome();
    const report = await runDoctor(
      goodDeps({ env: { ANTHROPIC_API_KEY: 'sk-test' }, oauthCredentialPresent: () => false }),
    );

    const check = findCheck(report.checks, 'credentials');
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('ANTHROPIC_API_KEY');
  });

  it('accepts the OAuth surface as the credential default when no env var is set (ND-19)', async () => {
    seedHome();
    const report = await runDoctor(goodDeps({ env: {}, oauthCredentialPresent: () => true }));

    const check = findCheck(report.checks, 'credentials');
    expect(check.status).toBe('ok');
    expect(check.detail).toMatch(/claude login|OAuth/i);
  });

  it('FAILs credentials with a claude-auth-login remediation when neither path is present', async () => {
    seedHome();
    const report = await runDoctor(goodDeps({ env: {}, oauthCredentialPresent: () => false }));

    const check = findCheck(report.checks, 'credentials');
    expect(check.status).toBe('fail');
    expect(check.remediation).toContain('claude auth login');
    expect(check.remediation).toContain('ANTHROPIC_API_KEY');
    expect(report.ok).toBe(false);
  });

  it('FAILs claude-binary when claude is not on PATH', async () => {
    seedHome();
    const report = await runDoctor(goodDeps({ claudeOnPath: () => false }));

    const check = findCheck(report.checks, 'claude-binary');
    expect(check.status).toBe('fail');
    expect(report.ok).toBe(false);
  });

  it('WARNs (not fails) server when the server is unreachable', async () => {
    seedHome();
    const report = await runDoctor(goodDeps({ probeServer: () => Promise.resolve('unreachable') }));

    const check = findCheck(report.checks, 'server');
    expect(check.status).toBe('warn');
    expect(check.remediation).toContain('relay server');
    expect(report.ok).toBe(true);
  });

  it('FAILs server when the token is rejected (401)', async () => {
    seedHome();
    const report = await runDoctor(goodDeps({ probeServer: () => Promise.resolve('bad_token') }));

    const check = findCheck(report.checks, 'server');
    expect(check.status).toBe('fail');
    expect(report.ok).toBe(false);
  });

  it('WARNs server when no token is available to probe with', async () => {
    seedHome();
    const report = await runDoctor(goodDeps({ probeServer: () => Promise.resolve('no_token') }));

    const check = findCheck(report.checks, 'server');
    expect(check.status).toBe('warn');
    expect(check.remediation).toMatch(/RELAY_TOKEN/);
    expect(report.ok).toBe(true);
  });

  it('never includes a credential value in any check detail or remediation', async () => {
    seedHome();
    const secret = 'sk-super-secret-value';
    const report = await runDoctor(goodDeps({ env: { ANTHROPIC_API_KEY: secret } }));

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(secret);
  });

  it('reports native-deps ok when addons load', async () => {
    seedHome();
    const report = await runDoctor(
      goodDeps({ nativeAddonsLoad: () => ({ ok: true, failed: [] }) }),
    );

    const check = findCheck(report.checks, 'native-deps');
    expect(check.status).toBe('ok');
  });

  it('fails native-deps with a remediation when an addon does not load', async () => {
    seedHome();
    const report = await runDoctor(
      goodDeps({ nativeAddonsLoad: () => ({ ok: false, failed: ['node-pty'] }) }),
    );

    const check = findCheck(report.checks, 'native-deps');
    expect(check.status).toBe('fail');
    expect(check.detail).toMatch(/node-pty/);
    expect(check.remediation).toBeDefined();
    expect(report.ok).toBe(false);
  });
});
