// The ND-33 P0 GUI surface: a sessions tree view in the Activity Bar. Sessions
// are grouped by project, each leaf carries a running/idle/killed badge (D-11)
// and attach/release/kill actions, and the whole tree refreshes by REST poll —
// per D-G2 the extension opens NO WebSocket, so a timer is the only live-status
// mechanism available. Poll cadence + lifecycle follow ND-37.

import * as vscode from 'vscode';

import { type Project, type Session, type SessionStatus } from '@relay/protocol';

import { loadCredentials } from './pairing.js';
import { RelayHttpError, RelayNetworkError, RelayRestClient } from './restClient.js';

// Per ND-37: 5s poll while the view is visible.
export const POLL_INTERVAL_MS = 5000;

export type TreeModel =
  | { kind: 'unpaired' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; projects: Project[]; sessions: Session[] };

export interface ProjectNode {
  kind: 'project';
  projectId: string;
  label: string;
  sessions: Session[];
}

export interface SessionNode {
  kind: 'session';
  session: Session;
}

export interface MessageNode {
  kind: 'message';
  message: string;
  icon: string;
}

export type SessionsTreeNode = ProjectNode | SessionNode | MessageNode;

export interface SessionsTreeDeps {
  // Returns the model to render. Production wires this to `loadSessionsModel`;
  // specs inject a fake so the provider is testable with no network.
  load: () => Promise<TreeModel>;
  // Override the ND-37 cadence (specs use a small value with fake timers).
  pollIntervalMs?: number;
}

export class SessionsTreeProvider
  implements vscode.TreeDataProvider<SessionsTreeNode>, vscode.Disposable
{
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData: vscode.Event<void> = this.emitter.event;

  // Pre-first-load state renders as "not connected" until refresh() runs.
  private model: TreeModel = { kind: 'unpaired' };
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly deps: SessionsTreeDeps) {}

  async refresh(): Promise<void> {
    // Per ND-37 rule 4: a failed poll renders an inline error and never tears
    // down the loop, so swallow the rejection into an error model here rather
    // than letting it escape the interval callback.
    try {
      this.model = await this.deps.load();
    } catch (err) {
      this.model = { kind: 'error', message: err instanceof Error ? err.message : String(err) };
    }
    this.emitter.fire();
  }

  // Per ND-37 rule 2: an immediate poll on becoming visible, then on cadence.
  // Idempotent — a second call while polling is a no-op (no duplicate timer).
  startPolling(): void {
    if (this.timer !== undefined) return;
    void this.refresh();
    this.timer = setInterval(() => {
      void this.refresh();
    }, this.deps.pollIntervalMs ?? POLL_INTERVAL_MS);
  }

  stopPolling(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  get polling(): boolean {
    return this.timer !== undefined;
  }

  getChildren(element?: SessionsTreeNode): SessionsTreeNode[] {
    if (element === undefined) return this.rootNodes();
    if (element.kind === 'project') {
      return element.sessions.map((session) => ({ kind: 'session', session }));
    }
    return [];
  }

  getTreeItem(node: SessionsTreeNode): vscode.TreeItem {
    if (node.kind === 'project') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      item.id = `project:${node.projectId}`;
      item.contextValue = 'relayProject';
      item.iconPath = new vscode.ThemeIcon('folder');
      item.description = String(node.sessions.length);
      return item;
    }
    if (node.kind === 'session') {
      const { session } = node;
      const item = new vscode.TreeItem(session.personaName, vscode.TreeItemCollapsibleState.None);
      item.id = `session:${session.id}`;
      // contextValue drives the per-status menu when-clauses in package.json.
      item.contextValue = `relaySession.${session.status}`;
      item.iconPath = statusIcon(session.status);
      item.description = `${session.status} · ${session.id.slice(0, 8)}`;
      item.tooltip = `${session.personaName}\nSession ${session.id}\nStatus: ${session.status}`;
      // Per D-11: a killed session is dead — no attach affordance. The default
      // click target on a live session is attach.
      if (session.status !== 'killed') {
        item.command = {
          command: 'relay.sessions.attachNode',
          title: 'Attach',
          arguments: [node],
        };
      }
      return item;
    }
    const item = new vscode.TreeItem(node.message, vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'relayMessage';
    item.iconPath = new vscode.ThemeIcon(node.icon);
    return item;
  }

  dispose(): void {
    this.stopPolling();
    this.emitter.dispose();
  }

  private rootNodes(): SessionsTreeNode[] {
    const model = this.model;
    if (model.kind === 'unpaired') {
      return [
        {
          kind: 'message',
          message: 'Not connected to a Relay server — run "Relay: Connect to server".',
          icon: 'plug',
        },
      ];
    }
    if (model.kind === 'error') {
      return [{ kind: 'message', message: model.message, icon: 'warning' }];
    }
    if (model.sessions.length === 0) {
      return [
        {
          kind: 'message',
          message: 'No sessions on this server. Use "Relay: Start session" to create one.',
          icon: 'info',
        },
      ];
    }
    // Group sessions by project. Known projects render first in projects order
    // (empty ones hidden); sessions whose project is not in the list fall into
    // an orphan node keyed by the raw projectId, appended last.
    const byProject = new Map<string, Session[]>();
    for (const session of model.sessions) {
      const bucket = byProject.get(session.projectId);
      if (bucket !== undefined) bucket.push(session);
      else byProject.set(session.projectId, [session]);
    }
    const nodes: ProjectNode[] = [];
    for (const project of model.projects) {
      const sessions = byProject.get(project.id);
      if (sessions !== undefined && sessions.length > 0) {
        nodes.push({
          kind: 'project',
          projectId: project.id,
          label: project.displayName,
          sessions,
        });
        byProject.delete(project.id);
      }
    }
    for (const [projectId, sessions] of byProject) {
      nodes.push({ kind: 'project', projectId, label: projectId, sessions });
    }
    return nodes;
  }
}

// Per D-11: the live badge set is exactly running / idle / killed. Each maps to
// a distinct themed codicon so the status reads at a glance.
export function statusIcon(status: SessionStatus): vscode.ThemeIcon {
  if (status === 'running') {
    return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green'));
  }
  if (status === 'idle') {
    return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.yellow'));
  }
  return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.red'));
}

// Production model loader: unpaired when there are no credentials; otherwise
// fetch projects + all sessions (running/idle/killed) in parallel and fold any
// REST/network failure into an error model the tree renders inline (ND-37
// rule 4 — a failed poll never tears down the refresh loop).
export async function loadSessionsModel(secrets: vscode.SecretStorage): Promise<TreeModel> {
  const creds = await loadCredentials(secrets);
  if (creds === undefined) return { kind: 'unpaired' };
  const client = new RelayRestClient(creds);
  try {
    const [projects, sessions] = await Promise.all([
      client.listProjects(),
      client.listAllSessions(),
    ]);
    return { kind: 'ready', projects, sessions: sessions.items };
  } catch (err) {
    if (err instanceof RelayHttpError) return { kind: 'error', message: err.toUserMessage() };
    if (err instanceof RelayNetworkError) return { kind: 'error', message: err.message };
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
