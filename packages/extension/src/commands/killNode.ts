// Tree per-node "kill" action → DELETE /sessions/:id (idempotent per D-11).
// Confirms first (destructive), then disposes any tracked attach terminal for
// the now-dead session and refreshes the tree.

import * as vscode from 'vscode';

import { loadCredentials } from '../pairing.js';
import { RelayHttpError, RelayNetworkError, RelayRestClient } from '../restClient.js';
import { type AttachTerminalRegistry } from '../terminalRegistry.js';
import { type SessionNode } from '../sessionsTree.js';

export interface KillNodeDeps {
  secrets: vscode.SecretStorage;
  registry: AttachTerminalRegistry;
  refresh: () => void;
}

export function registerKillNode(context: vscode.ExtensionContext, deps: KillNodeDeps): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('relay.sessions.killNode', async (node: SessionNode) => {
      const creds = await loadCredentials(deps.secrets);
      if (creds === undefined) {
        void vscode.window.showErrorMessage(
          'Relay is not paired. Run "Relay: Connect to server" first.',
        );
        return;
      }
      // Kill terminates the agent process (D-11) — confirm before the irreversible step.
      const choice = await vscode.window.showWarningMessage(
        `Kill session ${node.session.id.slice(0, 8)} (${node.session.personaName})? This terminates the agent process.`,
        { modal: true },
        'Kill',
      );
      if (choice !== 'Kill') return;
      const client = new RelayRestClient(creds);
      try {
        await client.deleteSession(node.session.id);
      } catch (err) {
        renderError(err);
        return;
      }
      // The session is dead now; dispose any attach terminal we still hold for it.
      deps.registry.release(node.session.id);
      deps.refresh();
    }),
  );
}

function renderError(err: unknown): void {
  if (err instanceof RelayHttpError) {
    void vscode.window.showErrorMessage(err.toUserMessage());
    return;
  }
  if (err instanceof RelayNetworkError) {
    void vscode.window.showErrorMessage(err.message);
    return;
  }
  void vscode.window.showErrorMessage(`Relay: ${(err as Error).message}`);
}
