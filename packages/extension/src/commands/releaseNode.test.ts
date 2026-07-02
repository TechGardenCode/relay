// Spec for the tree per-node "release" command. Per D-G2 the extension holds no
// claim; release disposes the spawned terminal (closing the WS → in-attach FSM
// releases) when one is tracked, and reports honestly when none is.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import * as vscode from 'vscode';

import { AttachTerminalRegistry } from '../terminalRegistry.js';
import { registerReleaseNode } from './releaseNode.js';
import { type SessionNode } from '../sessionsTree.js';

const SESSION_ID = '01HZZZZZZZZZZZZZZZZSESSON1';

function makeNode(): SessionNode {
  return {
    kind: 'session',
    session: {
      id: SESSION_ID,
      projectId: '01HZZZZZZZZZZZZZZZZZPROJA',
      agentCli: 'claude',
      agentSessionId: null,
      ptyPid: null,
      status: 'running',
      terminatedReason: null,
      totalBytes: 0,
      createdAt: '2026-05-26T00:00:00.000Z',
      updatedAt: '2026-05-26T00:00:00.000Z',
    },
  };
}

function fakeContext(): vscode.ExtensionContext {
  return { subscriptions: [] } as unknown as vscode.ExtensionContext;
}

beforeEach(() => {
  vscode.__test.reset();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('relay.sessions.releaseNode', () => {
  it('disposes the tracked terminal and shows no information message', async () => {
    const registry = new AttachTerminalRegistry();
    const terminal = {
      name: 'relay',
      show: () => {},
      dispose: vi.fn(),
    } as unknown as vscode.Terminal;
    registry.track(SESSION_ID, terminal);
    const info = vi.spyOn(vscode.window, 'showInformationMessage');

    registerReleaseNode(fakeContext(), { registry });
    await vscode.commands.executeCommand('relay.sessions.releaseNode', makeNode());

    expect(registry.has(SESSION_ID)).toBe(false);
    expect(info).not.toHaveBeenCalled();
  });

  it('shows exactly one information message when no terminal is tracked', async () => {
    const registry = new AttachTerminalRegistry();
    const info = vi.spyOn(vscode.window, 'showInformationMessage');

    registerReleaseNode(fakeContext(), { registry });
    await vscode.commands.executeCommand('relay.sessions.releaseNode', makeNode());

    expect(info).toHaveBeenCalledTimes(1);
    const msg = String(info.mock.calls[0]![0]).toLowerCase();
    expect(msg).toMatch(/release|no attached terminal/);
  });
});
