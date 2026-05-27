// Spec for AttachTerminalRegistry — window-local bookkeeping of the `relay
// attach` terminals the extension spawned. Per D-G2 the extension holds no
// claim; the only release lever is disposing the terminal it created, which
// closes the WS and lets the in-attach FSM release the claim (D-G2 rule 4).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import * as vscode from 'vscode';

import { AttachTerminalRegistry } from './terminalRegistry.js';

const SESSION_ID = '01HZZZZZZZZZZZZZZZZSESSON1';

function fakeTerminal(): vscode.Terminal & { dispose: ReturnType<typeof vi.fn> } {
  return {
    name: 'relay',
    show: () => {},
    dispose: vi.fn(),
  } as unknown as vscode.Terminal & { dispose: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vscode.__test.reset();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AttachTerminalRegistry', () => {
  it('has(id) is true after track(id, terminal)', () => {
    const registry = new AttachTerminalRegistry();
    registry.track(SESSION_ID, fakeTerminal());
    expect(registry.has(SESSION_ID)).toBe(true);
  });

  it('release on a tracked session returns true, disposes the terminal, and evicts it', () => {
    // Per D-G2 rule 4: disposing the spawned terminal closes its WS → in-attach FSM releases the claim.
    const registry = new AttachTerminalRegistry();
    const terminal = fakeTerminal();
    registry.track(SESSION_ID, terminal);
    const result = registry.release(SESSION_ID);
    expect(result).toBe(true);
    expect(terminal.dispose).toHaveBeenCalledTimes(1);
    expect(registry.has(SESSION_ID)).toBe(false);
  });

  it('release on an untracked session returns false, does not throw, and disposes nothing', () => {
    const registry = new AttachTerminalRegistry();
    const terminal = fakeTerminal();
    // Track a different session so we can prove its terminal was untouched.
    registry.track('01HZZZZZZZZZZZZZZZZOTHER01', terminal);
    let result: boolean | undefined;
    expect(() => {
      result = registry.release(SESSION_ID);
    }).not.toThrow();
    expect(result).toBe(false);
    expect(terminal.dispose).not.toHaveBeenCalled();
  });

  it('evicts a terminal the user closed by hand so a later release reports honestly', () => {
    // A hand-closed terminal is no longer ours to release; release must then no-op.
    const registry = new AttachTerminalRegistry();
    const terminal = fakeTerminal();
    registry.track(SESSION_ID, terminal);
    vscode.__test.fireTerminalClose(terminal);
    expect(registry.has(SESSION_ID)).toBe(false);
    expect(registry.release(SESSION_ID)).toBe(false);
  });

  it('dispose clears the map and unsubscribes without throwing', () => {
    const registry = new AttachTerminalRegistry();
    registry.track(SESSION_ID, fakeTerminal());
    expect(() => {
      registry.dispose();
    }).not.toThrow();
    expect(registry.has(SESSION_ID)).toBe(false);
  });
});
