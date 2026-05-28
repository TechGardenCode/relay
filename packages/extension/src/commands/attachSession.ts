// "Relay: Attach to session" — quick-pick over the running sessions on the
// paired server, opens a terminal running `relay attach <id>`. Reattach
// semantics are owned by `relay attach` per D-G3.

import * as vscode from 'vscode';

import { type Session } from '@relay/protocol';

import { loadCredentials } from '../pairing.js';
import { groupQuickPickItems } from '../quickPickGroups.js';
import { RelayHttpError, RelayNetworkError, RelayRestClient } from '../restClient.js';

import { spawnAttachTerminal } from './startSession.js';

export function registerAttachSession(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('relay.attachSession', async () => {
      const creds = await loadCredentials(context.secrets);
      if (creds === undefined) {
        void vscode.window.showErrorMessage(
          'Relay is not paired. Run "Relay: Connect to server" first.',
        );
        return;
      }
      const client = new RelayRestClient(creds);
      let response;
      try {
        response = await client.listRunningSessions();
      } catch (err) {
        if (err instanceof RelayHttpError) {
          void vscode.window.showErrorMessage(err.toUserMessage());
        } else if (err instanceof RelayNetworkError) {
          void vscode.window.showErrorMessage(err.message);
        } else {
          void vscode.window.showErrorMessage(`Relay: ${(err as Error).message}`);
        }
        return;
      }
      if (response.items.length === 0) {
        void vscode.window.showInformationMessage(
          'No running Relay sessions on this server. Use "Relay: Start session" to create one.',
        );
        return;
      }
      // Per ND-33 (f): group the session list by project + matchOnDetail so a
      // long list narrows. Project display names are best-effort — a failed
      // /projects fetch falls back to raw projectIds rather than failing attach,
      // since the grouping is presentational only.
      const projectLabelOf = await loadProjectLabeller(client);
      const picked = await vscode.window.showQuickPick(
        buildSessionQuickPickItems(response.items, projectLabelOf),
        {
          placeHolder: 'Pick a session to attach to',
          matchOnDescription: true,
          matchOnDetail: true,
        },
      );
      // Separator rows carry no session and are never returned by showQuickPick;
      // the `in` guard narrows the union so picked.session is safe to read.
      if (picked === undefined || !('session' in picked)) return;
      spawnAttachTerminal({
        sessionId: picked.session.id,
        rootName: picked.session.id.slice(0, 8),
        creds,
      });
    }),
  );
}

interface SessionQuickPickItem extends vscode.QuickPickItem {
  label: string;
  session: Session;
}

// Per ND-33 (f): build the attach quick-pick items grouped under per-project
// separator headers (first-seen order). Exported so the item shape + grouping
// is unit-testable without driving the whole command.
export function buildSessionQuickPickItems(
  sessions: readonly Session[],
  projectLabelOf: (projectId: string) => string,
): (SessionQuickPickItem | vscode.QuickPickItem)[] {
  const items: SessionQuickPickItem[] = sessions.map((s) => ({
    // Per D-17: no persona to label with — the short session id disambiguates.
    label: s.id.slice(0, 8),
    description: s.id,
    detail: `${projectLabelOf(s.projectId)} · ${s.agentSessionId ?? '(agent session id pending)'}`,
    session: s,
  }));
  return groupQuickPickItems(items, (item) => projectLabelOf(item.session.projectId));
}

// Resolve a projectId → display-name labeller from the server's project list.
// Best-effort: on any failure the labeller falls back to the raw projectId, so
// a /projects hiccup degrades grouping headers without blocking attach.
async function loadProjectLabeller(
  client: RelayRestClient,
): Promise<(projectId: string) => string> {
  const byId = new Map<string, string>();
  try {
    for (const p of await client.listProjects()) byId.set(p.id, p.displayName);
  } catch {
    // Cosmetic-only — raw projectIds are acceptable group headers.
  }
  return (projectId: string): string => byId.get(projectId) ?? projectId;
}
