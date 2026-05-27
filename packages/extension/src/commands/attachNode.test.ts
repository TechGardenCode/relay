// Spec for the tree per-node "attach" command. Reuses the subprocess-of-attach
// pattern (D-G2): spawn `relay attach <id>` in a terminal and register it so a
// later "release" can dispose it. Refuses (error) when unpaired.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import * as vscode from 'vscode';

import { AttachTerminalRegistry } from '../terminalRegistry.js';
import { registerAttachNode } from './attachNode.js';
import { type SessionNode } from '../sessionsTree.js';

const SESSION_ID = '01HZZZZZZZZZZZZZZZZSESSON1';
const SERVER_URL = 'https://relay.lan';
const TOKEN = '01HZZZZZZZZZZZZZZZZZTOKEN01';

function makeNode(): SessionNode {
  return {
    kind: 'session',
    session: {
      id: SESSION_ID,
      projectId: '01HZZZZZZZZZZZZZZZZZPROJA',
      personaName: 'reviewer',
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

// loadCredentials reads `relay.serverUrl` / `relay.token` from SecretStorage.
function secretsWith(entries: Array<[string, string]>): vscode.SecretStorage {
  const store = new Map<string, string>(entries);
  return {
    get: (key: string) => Promise.resolve(store.get(key)),
    store: (key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
    onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event,
  } as unknown as vscode.SecretStorage;
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

describe('relay.sessions.attachNode', () => {
  it('creates one terminal and registers the session when paired', async () => {
    const secrets = secretsWith([
      ['relay.serverUrl', SERVER_URL],
      ['relay.token', TOKEN],
    ]);
    const registry = new AttachTerminalRegistry();

    registerAttachNode(fakeContext(), { secrets, registry });
    await vscode.commands.executeCommand('relay.sessions.attachNode', makeNode());

    expect(vscode.__test.createdTerminals).toHaveLength(1);
    expect(registry.has(SESSION_ID)).toBe(true);
  });

  it('shows an error and creates no terminal when not paired', async () => {
    const secrets = secretsWith([]);
    const registry = new AttachTerminalRegistry();
    const error = vi.spyOn(vscode.window, 'showErrorMessage');

    registerAttachNode(fakeContext(), { secrets, registry });
    await vscode.commands.executeCommand('relay.sessions.attachNode', makeNode());

    expect(error).toHaveBeenCalled();
    expect(vscode.__test.createdTerminals).toHaveLength(0);
    expect(registry.has(SESSION_ID)).toBe(false);
  });
});
