// "Relay: Attach to session" — quick-pick over the running sessions on the
// paired server, opens a terminal running `relay attach <id>`. Reattach
// semantics are owned by `relay attach` per D-G3.

import * as vscode from 'vscode';

import { loadCredentials } from '../pairing.js';
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
      const picked = await vscode.window.showQuickPick(
        response.items.map((s) => ({
          label: s.personaName,
          description: s.id,
          detail: `project ${s.projectId} · ${s.agentSessionId ?? '(agent session id pending)'}`,
          session: s,
        })),
        { placeHolder: 'Pick a session to attach to', matchOnDescription: true },
      );
      if (picked === undefined) return;
      spawnAttachTerminal({
        sessionId: picked.session.id,
        personaName: picked.session.personaName,
        rootName: picked.session.id.slice(0, 8),
        creds,
      });
    }),
  );
}
