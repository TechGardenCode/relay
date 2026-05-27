// Spec for the tree per-node "kill" command → DELETE /sessions/:id (idempotent
// per D-11). Confirms destructively first, then refreshes the tree. A declined
// confirmation must not touch the network.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import * as vscode from 'vscode';

import { AttachTerminalRegistry } from '../terminalRegistry.js';
import { registerKillNode } from './killNode.js';
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
function pairedSecrets(): vscode.SecretStorage {
  const store = new Map<string, string>([
    ['relay.serverUrl', SERVER_URL],
    ['relay.token', TOKEN],
  ]);
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

function fakeContext(secrets: vscode.SecretStorage): vscode.ExtensionContext {
  return { subscriptions: [], secrets } as unknown as vscode.ExtensionContext;
}

beforeEach(() => {
  vscode.__test.reset();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('relay.sessions.killNode', () => {
  it('does not fetch or refresh when the confirmation is declined', async () => {
    const warn = vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const refresh = vi.fn();
    const secrets = pairedSecrets();
    const context = fakeContext(secrets);

    registerKillNode(context, { secrets, registry: new AttachTerminalRegistry(), refresh });
    await vscode.commands.executeCommand('relay.sessions.killNode', makeNode());

    expect(warn).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('DELETEs /sessions/:id and refreshes once when the confirmation is accepted', async () => {
    // Per D-11: DELETE is idempotent; 204 → undefined. The tree refreshes after.
    vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Kill' as unknown as undefined);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const refresh = vi.fn();
    const secrets = pairedSecrets();
    const context = fakeContext(secrets);

    registerKillNode(context, { secrets, registry: new AttachTerminalRegistry(), refresh });
    await vscode.commands.executeCommand('relay.sessions.killNode', makeNode());

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect((init as RequestInit).method).toBe('DELETE');
    expect(String(url)).toMatch(new RegExp(`/sessions/${SESSION_ID}$`));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
