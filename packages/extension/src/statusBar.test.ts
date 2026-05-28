// Spec for RelayStatusBar (ND-37 #6 adapted): the running-session indicator
// reuses the shared PollLoop, so paired-state is its visibility/attention proxy
// — refresh() with paired creds starts the poll, unpaired stops it, dispose
// tears it down. The poll-derived count renders a $(pulse) segment only when
// positive; the tooltip always carries the count detail; a failed poll renders
// an unavailable-count placeholder and the loop survives (ND-37 rule 4), with
// the next successful poll recovering the count. Network stays out — every test
// injects a loadRunning fake; the real loader is never called.
//
// Coverage map — packages/extension/src/statusBar.ts (ND-37 #6):
//   Owns:
//     - poll lifecycle tracks paired-state     → describe('poll lifecycle')
//     - dispose stops polling                   → describe('poll lifecycle') > 'dispose stops…'
//     - count render ($(pulse) + tooltip)       → describe('count render')
//     - zero-count render (no pulse, tooltip)   → describe('count render') > 'with zero…'
//     - error placeholder + recovery (rule 4)   → describe('error placeholder (ND-37 rule 4)')

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import * as vscode from 'vscode';

import { RelayStatusBar, type RunningLoadResult } from './statusBar.js';

// Minimal in-memory SecretStorage. Credentials live under relay.serverUrl /
// relay.token (see loadCredentials in pairing.ts); onDidChange is an
// EventEmitter so the status bar's defense-in-depth listener type-checks.
function makeSecrets(initial: Record<string, string> = {}): vscode.SecretStorage {
  const store = new Map<string, string>(Object.entries(initial));
  const emitter = new vscode.EventEmitter<{ key: string }>();
  return {
    get: (key: string) => Promise.resolve(store.get(key)),
    store: (key: string, value: string) => {
      store.set(key, value);
      emitter.fire({ key });
      return Promise.resolve();
    },
    delete: (key: string) => {
      store.delete(key);
      emitter.fire({ key });
      return Promise.resolve();
    },
    keys: () => Promise.resolve([...store.keys()]),
    onDidChange: emitter.event,
  };
}

const PAIRED = { 'relay.serverUrl': 'https://relay.lan', 'relay.token': 'tok-123' };

beforeEach(() => {
  vscode.__test.reset();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('poll lifecycle', () => {
  it('starts polling when refresh runs with paired credentials', async () => {
    // Per ND-37 #6 (adapted): paired-state is the status bar's attention proxy.
    const bar = new RelayStatusBar(makeSecrets(PAIRED), {
      loadRunning: () => Promise.resolve<RunningLoadResult>({ kind: 'unpaired' }),
    });
    await bar.refresh();
    expect(bar.polling).toBe(true);
    bar.dispose();
  });

  it('does not poll when refresh runs unpaired', async () => {
    const bar = new RelayStatusBar(makeSecrets(), {
      loadRunning: () => Promise.resolve<RunningLoadResult>({ kind: 'unpaired' }),
    });
    await bar.refresh();
    expect(bar.polling).toBe(false);
    bar.dispose();
  });

  it('starts on pairing and stops when credentials are later cleared', async () => {
    const secrets = makeSecrets();
    const bar = new RelayStatusBar(secrets, {
      loadRunning: () => Promise.resolve<RunningLoadResult>({ kind: 'count', running: 1 }),
    });
    await bar.refresh();
    expect(bar.polling).toBe(false);

    await secrets.store('relay.serverUrl', 'https://relay.lan');
    await secrets.store('relay.token', 'tok-123');
    await bar.refresh();
    expect(bar.polling).toBe(true);

    await secrets.delete('relay.serverUrl');
    await secrets.delete('relay.token');
    await bar.refresh();
    expect(bar.polling).toBe(false);
    bar.dispose();
  });

  it('dispose stops polling', async () => {
    // Per ND-37 rule 3: dispose tears the poll timer down.
    const bar = new RelayStatusBar(makeSecrets(PAIRED), {
      loadRunning: () => Promise.resolve<RunningLoadResult>({ kind: 'count', running: 1 }),
    });
    await bar.refresh();
    expect(bar.polling).toBe(true);
    bar.dispose();
    expect(bar.polling).toBe(false);
  });
});

describe('count render', () => {
  it('renders a $(pulse) N segment and a running-sessions tooltip for a positive count', async () => {
    const bar = new RelayStatusBar(makeSecrets(PAIRED), {
      loadRunning: () => Promise.resolve<RunningLoadResult>({ kind: 'count', running: 3 }),
    });
    // refresh() starts the poll, which fires an immediate tick (ND-37 rule 2)
    // and renders the count.
    await bar.refresh();
    await vi.waitFor(() => expect(bar.text).toContain('$(pulse) 3'));
    expect(bar.tooltip).toContain('3 running session');
    bar.dispose();
  });

  it('with zero running sessions shows no $(pulse) segment but notes none in the tooltip', async () => {
    // Only a positive count earns status-bar real estate; the detail still lands
    // in the tooltip.
    const bar = new RelayStatusBar(makeSecrets(PAIRED), {
      loadRunning: () => Promise.resolve<RunningLoadResult>({ kind: 'count', running: 0 }),
    });
    await bar.refresh();
    await vi.waitFor(() => expect(bar.tooltip).toContain('No running sessions'));
    expect(bar.text).not.toContain('$(pulse)');
    bar.dispose();
  });
});

describe('error placeholder (ND-37 rule 4)', () => {
  it('keeps polling on a failed poll, renders the unavailable-count tooltip, then recovers', async () => {
    // Per ND-37 rule 4: a failed poll renders an inline placeholder and the loop
    // survives; the next successful tick recovers the count.
    vi.useFakeTimers();
    let result: RunningLoadResult = { kind: 'error', message: 'Could not reach https://relay.lan' };
    const bar = new RelayStatusBar(makeSecrets(PAIRED), {
      loadRunning: () => Promise.resolve(result),
      pollIntervalMs: 1000,
    });
    // refresh() starts the poll + fires the immediate (failing) tick.
    await bar.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(bar.polling).toBe(true);
    expect(bar.tooltip).toContain('Running-session count unavailable');
    expect(bar.tooltip).toContain('Could not reach https://relay.lan');

    // A subsequent successful poll recovers the count.
    result = { kind: 'count', running: 2 };
    await vi.advanceTimersByTimeAsync(1000);
    expect(bar.polling).toBe(true);
    expect(bar.text).toContain('$(pulse) 2');
    bar.dispose();
  });
});
