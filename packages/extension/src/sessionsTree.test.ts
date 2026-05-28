// Spec for the ND-33 P0 sessions tree view. Asserts the TreeDataProvider
// contract (synchronous getChildren over a cached model, REST-poll refresh per
// ND-37), the D-11 status badges, and the ND-37 poll lifecycle (5s cadence,
// idempotent start, dispose teardown, survive a rejected poll).
//
// Coverage map:
//   getChildren (synchronous over cached model):
//     - pre-refresh plug message        → describe('getChildren — pre-refresh')
//     - unpaired / error / ready models → describe('getChildren — model states')
//     - project grouping + ordering     → describe('getChildren — ready model grouping')
//     - orphan-project fallback         → describe('getChildren — orphan sessions')
//     - leaf / message children = []    → describe('getChildren — leaf nodes')
//   getTreeItem (project / session / message rendering, D-11):
//     - describe('getTreeItem')
//   refresh (ND-37 manual poll, fires onDidChangeTreeData):
//     - describe('refresh')
//   polling lifecycle (ND-37 rules 1–4):
//     - describe('polling')
//   statusIcon (D-11 distinct badges):
//     - describe('statusIcon')

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import * as vscode from 'vscode';

import { type Project, type Session, type SessionStatus } from '@relay/protocol';

import {
  SessionsTreeProvider,
  statusIcon,
  type MessageNode,
  type ProjectNode,
  type SessionNode,
  type TreeModel,
} from './sessionsTree.js';

// ---- inline fixtures (no shared extension fixture library yet) ----

// 26-char Crockford-Base32 ULIDs (UlidSchema requires length 26).
const PROJECT_A = '01HZZZZZZZZZZZZZZZZZPROJA';
const PROJECT_B = '01HZZZZZZZZZZZZZZZZZPROJB';
const SESSION_1 = '01HZZZZZZZZZZZZZZZZSESSON1';
const SESSION_2 = '01HZZZZZZZZZZZZZZZZSESSON2';
const TENANT = '01HZZZZZZZZZZZZZZZZTENANT1';

function makeProject(id: string, displayName: string): Project {
  return {
    id,
    tenantId: TENANT,
    slug: 'proj-' + id.slice(-4).toLowerCase(),
    displayName,
    canonicalPath: '/work/' + displayName,
    agentCli: 'claude',
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
  };
}

function makeSession(id: string, projectId: string, status: SessionStatus): Session {
  return {
    id,
    projectId,
    personaName: 'reviewer',
    agentCli: 'claude',
    agentSessionId: null,
    ptyPid: null,
    status,
    terminatedReason: null,
    totalBytes: 0,
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
  };
}

function makeProvider(
  load: () => Promise<TreeModel>,
  pollIntervalMs?: number,
): SessionsTreeProvider {
  return new SessionsTreeProvider({ load, pollIntervalMs });
}

beforeEach(() => {
  vscode.__test.reset();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getChildren — pre-refresh', () => {
  it('returns a single plug message node mentioning connecting before any refresh', () => {
    const provider = makeProvider(() => Promise.resolve({ kind: 'unpaired' }));
    const roots = provider.getChildren();
    expect(roots).toHaveLength(1);
    const node = roots[0] as MessageNode;
    expect(node.kind).toBe('message');
    expect(node.icon).toBe('plug');
    expect(node.message.toLowerCase()).toContain('connect');
  });
});

describe('getChildren — model states', () => {
  it('renders the plug message node when the model is unpaired', async () => {
    const provider = makeProvider(() => Promise.resolve({ kind: 'unpaired' }));
    await provider.refresh();
    const node = provider.getChildren()[0] as MessageNode;
    expect(node.kind).toBe('message');
    expect(node.icon).toBe('plug');
    expect(node.message.toLowerCase()).toContain('connect');
  });

  it('renders a warning message node carrying the error message for an error model', async () => {
    // Per ND-37 rule 4: a failed poll renders an in-tree error placeholder.
    const provider = makeProvider(() =>
      Promise.resolve({ kind: 'error', message: 'Could not reach https://relay.lan' }),
    );
    await provider.refresh();
    const node = provider.getChildren()[0] as MessageNode;
    expect(node.kind).toBe('message');
    expect(node.icon).toBe('warning');
    expect(node.message).toBe('Could not reach https://relay.lan');
  });

  it('renders an info message node mentioning no sessions when ready with zero sessions', async () => {
    const provider = makeProvider(() =>
      Promise.resolve({ kind: 'ready', projects: [makeProject(PROJECT_A, 'Alpha')], sessions: [] }),
    );
    await provider.refresh();
    const roots = provider.getChildren();
    expect(roots).toHaveLength(1);
    const node = roots[0] as MessageNode;
    expect(node.kind).toBe('message');
    expect(node.icon).toBe('info');
    expect(node.message.toLowerCase()).toContain('session');
  });
});

describe('getChildren — ready model grouping', () => {
  it('returns one ProjectNode per project that has at least one session, in projects order', async () => {
    const provider = makeProvider(() =>
      Promise.resolve({
        kind: 'ready',
        projects: [makeProject(PROJECT_A, 'Alpha'), makeProject(PROJECT_B, 'Bravo')],
        sessions: [
          makeSession(SESSION_1, PROJECT_A, 'running'),
          makeSession(SESSION_2, PROJECT_B, 'idle'),
        ],
      }),
    );
    await provider.refresh();
    const roots = provider.getChildren() as ProjectNode[];
    expect(roots).toHaveLength(2);
    expect(roots.map((n) => n.kind)).toEqual(['project', 'project']);
    expect(roots.map((n) => n.projectId)).toEqual([PROJECT_A, PROJECT_B]);
    expect(roots.map((n) => n.label)).toEqual(['Alpha', 'Bravo']);
  });

  it('hides projects that have zero sessions', async () => {
    const provider = makeProvider(() =>
      Promise.resolve({
        kind: 'ready',
        projects: [makeProject(PROJECT_A, 'Alpha'), makeProject(PROJECT_B, 'Bravo')],
        sessions: [makeSession(SESSION_1, PROJECT_A, 'running')],
      }),
    );
    await provider.refresh();
    const roots = provider.getChildren() as ProjectNode[];
    expect(roots).toHaveLength(1);
    expect(roots[0]!.projectId).toBe(PROJECT_A);
  });

  it('uses project.displayName as the ProjectNode label', async () => {
    const provider = makeProvider(() =>
      Promise.resolve({
        kind: 'ready',
        projects: [makeProject(PROJECT_A, 'My Display Name')],
        sessions: [makeSession(SESSION_1, PROJECT_A, 'running')],
      }),
    );
    await provider.refresh();
    const roots = provider.getChildren() as ProjectNode[];
    expect(roots[0]!.label).toBe('My Display Name');
  });

  it('returns a project node’s sessions as SessionNodes in order via getChildren(projectNode)', async () => {
    const provider = makeProvider(() =>
      Promise.resolve({
        kind: 'ready',
        projects: [makeProject(PROJECT_A, 'Alpha')],
        sessions: [
          makeSession(SESSION_1, PROJECT_A, 'running'),
          makeSession(SESSION_2, PROJECT_A, 'killed'),
        ],
      }),
    );
    await provider.refresh();
    const projectNode = (provider.getChildren() as ProjectNode[])[0]!;
    const children = provider.getChildren(projectNode) as SessionNode[];
    expect(children).toHaveLength(2);
    expect(children.map((n) => n.kind)).toEqual(['session', 'session']);
    expect(children.map((n) => n.session.id)).toEqual([SESSION_1, SESSION_2]);
  });
});

describe('getChildren — orphan sessions', () => {
  it('groups sessions with no matching project under an orphan ProjectNode labelled by projectId, appended last', async () => {
    const orphanProjectId = '01HZZZZZZZZZZZZZZZZORPHAN1';
    const provider = makeProvider(() =>
      Promise.resolve({
        kind: 'ready',
        projects: [makeProject(PROJECT_A, 'Alpha')],
        sessions: [
          makeSession(SESSION_1, PROJECT_A, 'running'),
          makeSession(SESSION_2, orphanProjectId, 'running'),
        ],
      }),
    );
    await provider.refresh();
    const roots = provider.getChildren() as ProjectNode[];
    expect(roots).toHaveLength(2);
    // Known-project node comes first; orphan is appended after.
    expect(roots[0]!.projectId).toBe(PROJECT_A);
    expect(roots[1]!.projectId).toBe(orphanProjectId);
    expect(roots[1]!.label).toBe(orphanProjectId);
  });
});

describe('getChildren — leaf nodes', () => {
  it('returns [] for a session node', async () => {
    const provider = makeProvider(() =>
      Promise.resolve({
        kind: 'ready',
        projects: [makeProject(PROJECT_A, 'Alpha')],
        sessions: [makeSession(SESSION_1, PROJECT_A, 'running')],
      }),
    );
    await provider.refresh();
    const sessionNode: SessionNode = {
      kind: 'session',
      session: makeSession(SESSION_1, PROJECT_A, 'running'),
    };
    expect(provider.getChildren(sessionNode)).toEqual([]);
  });

  it('returns [] for a message node', () => {
    const provider = makeProvider(() => Promise.resolve({ kind: 'unpaired' }));
    const messageNode: MessageNode = { kind: 'message', message: 'x', icon: 'plug' };
    expect(provider.getChildren(messageNode)).toEqual([]);
  });
});

describe('getTreeItem', () => {
  it('renders a project node as an expanded folder with a session-count description', async () => {
    const provider = makeProvider(() =>
      Promise.resolve({
        kind: 'ready',
        projects: [makeProject(PROJECT_A, 'Alpha')],
        sessions: [
          makeSession(SESSION_1, PROJECT_A, 'running'),
          makeSession(SESSION_2, PROJECT_A, 'idle'),
        ],
      }),
    );
    await provider.refresh();
    const projectNode = (provider.getChildren() as ProjectNode[])[0]!;
    const item = provider.getTreeItem(projectNode);
    expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
    expect(item.contextValue).toBe('relayProject');
    expect(item.iconPath).toBeInstanceOf(vscode.ThemeIcon);
    expect((item.iconPath as vscode.ThemeIcon).id).toBe('folder');
    expect(item.description).toBe('2');
  });

  it('renders a running session leaf with an attach command and a running contextValue', () => {
    // Per D-11: the badge set is running / idle / killed; running carries the attach affordance.
    const session = makeSession(SESSION_1, PROJECT_A, 'running');
    const node: SessionNode = { kind: 'session', session };
    const provider = makeProvider(() => Promise.resolve({ kind: 'unpaired' }));
    const item = provider.getTreeItem(node);
    // Per D-17: the session leaf is labelled by its short id, not a persona.
    expect(item.label).toBe(session.id.slice(0, 8));
    expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
    expect(item.contextValue).toBe('relaySession.running');
    expect(item.iconPath).toBeInstanceOf(vscode.ThemeIcon);
    expect(String(item.description)).toContain('running');
    expect(item.command?.command).toBe('relay.sessions.attachNode');
    expect(item.command?.arguments).toEqual([node]);
  });

  it('renders a killed session leaf with no attach command', () => {
    // Per D-11: a killed session is dead; offering attach on it is incorrect.
    const session = makeSession(SESSION_1, PROJECT_A, 'killed');
    const node: SessionNode = { kind: 'session', session };
    const provider = makeProvider(() => Promise.resolve({ kind: 'unpaired' }));
    const item = provider.getTreeItem(node);
    expect(item.contextValue).toBe('relaySession.killed');
    expect(item.command).toBeUndefined();
  });

  it('renders a message node with its icon as a ThemeIcon and a message label', () => {
    const node: MessageNode = {
      kind: 'message',
      message: 'Connect to a Relay server',
      icon: 'plug',
    };
    const provider = makeProvider(() => Promise.resolve({ kind: 'unpaired' }));
    const item = provider.getTreeItem(node);
    expect(item.label).toBe('Connect to a Relay server');
    expect(item.iconPath).toBeInstanceOf(vscode.ThemeIcon);
    expect((item.iconPath as vscode.ThemeIcon).id).toBe('plug');
    expect(item.contextValue).toBe('relayMessage');
  });
});

describe('refresh', () => {
  it('awaits deps.load exactly once and swaps the cached model', async () => {
    let kind: TreeModel = { kind: 'unpaired' };
    const load = vi.fn(() => Promise.resolve(kind));
    const provider = makeProvider(load);

    kind = {
      kind: 'ready',
      projects: [makeProject(PROJECT_A, 'Alpha')],
      sessions: [makeSession(SESSION_1, PROJECT_A, 'running')],
    };
    await provider.refresh();

    expect(load).toHaveBeenCalledTimes(1);
    const roots = provider.getChildren() as ProjectNode[];
    expect(roots).toHaveLength(1);
    expect(roots[0]!.projectId).toBe(PROJECT_A);
  });

  it('fires onDidChangeTreeData after refresh', async () => {
    const provider = makeProvider(() => Promise.resolve({ kind: 'unpaired' }));
    const listener = vi.fn();
    provider.onDidChangeTreeData(listener);
    await provider.refresh();
    expect(listener).toHaveBeenCalled();
  });
});

describe('polling', () => {
  it('does one immediate load then one load per interval tick, and reports polling=true', async () => {
    // Per ND-37 rule 2: an immediate poll on becoming visible, then on cadence.
    vi.useFakeTimers();
    const load = vi.fn(() => Promise.resolve<TreeModel>({ kind: 'unpaired' }));
    const provider = makeProvider(load, 1000);
    provider.startPolling();
    expect(provider.polling).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('is idempotent — a second startPolling does not create a second timer', async () => {
    // Per ND-37 rule 6 + the source comment: idempotent start, never two timers.
    vi.useFakeTimers();
    const load = vi.fn(() => Promise.resolve<TreeModel>({ kind: 'unpaired' }));
    const provider = makeProvider(load, 1000);
    provider.startPolling();
    provider.startPolling();
    await vi.advanceTimersByTimeAsync(1000);
    // immediate (1) + one tick (1) = 2, not 3 (a duplicate timer would add a tick).
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('stopPolling halts further loads and reports polling=false', async () => {
    // Per ND-37 rule 3: the interval is cleared on teardown.
    vi.useFakeTimers();
    const load = vi.fn(() => Promise.resolve<TreeModel>({ kind: 'unpaired' }));
    const provider = makeProvider(load, 1000);
    provider.startPolling();
    const afterStart = load.mock.calls.length;
    provider.stopPolling();
    expect(provider.polling).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(load).toHaveBeenCalledTimes(afterStart);
  });

  it('dispose stops polling', async () => {
    // Per ND-37 rule 3: dispose tears the timer down; no timer outlives the host.
    vi.useFakeTimers();
    const load = vi.fn(() => Promise.resolve<TreeModel>({ kind: 'unpaired' }));
    const provider = makeProvider(load, 1000);
    provider.startPolling();
    const afterStart = load.mock.calls.length;
    provider.dispose();
    expect(provider.polling).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(load).toHaveBeenCalledTimes(afterStart);
  });

  it('keeps polling after a load rejects during a poll', async () => {
    // Per ND-37 rule 4: a thrown error during a poll does NOT stop the timer.
    vi.useFakeTimers();
    let shouldReject = true;
    const load = vi.fn(() => {
      if (shouldReject) {
        shouldReject = false;
        return Promise.reject(new Error('transient'));
      }
      return Promise.resolve<TreeModel>({ kind: 'unpaired' });
    });
    const provider = makeProvider(load, 1000);
    provider.startPolling();
    // Immediate poll rejected; the timer must survive.
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(provider.polling).toBe(true);
    // load kept being called past the rejection (immediate + 2 ticks = 3).
    expect(load).toHaveBeenCalledTimes(3);
  });
});

describe('statusIcon', () => {
  it('maps running / idle / killed to three distinct stable ThemeIcon ids', () => {
    // Per D-11: the live badge set is exactly running / idle / killed.
    const running = statusIcon('running');
    const idle = statusIcon('idle');
    const killed = statusIcon('killed');
    expect(running).toBeInstanceOf(vscode.ThemeIcon);
    expect(idle).toBeInstanceOf(vscode.ThemeIcon);
    expect(killed).toBeInstanceOf(vscode.ThemeIcon);
    const ids = new Set([running.id, idle.id, killed.id]);
    expect(ids.size).toBe(3);
    // Stable across calls.
    expect(statusIcon('running').id).toBe(running.id);
  });
});
