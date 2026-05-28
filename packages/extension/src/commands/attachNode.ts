// Tree per-node "attach" action. Reuses the 6I subprocess-of-attach pattern:
// spawn `relay attach <id>` in a terminal (the FSM lives in that subprocess per
// D-G2), and register the terminal so a later "release" can dispose it.

import * as vscode from 'vscode';

import { loadCredentials } from '../pairing.js';
import { type AttachTerminalRegistry } from '../terminalRegistry.js';
import { type SessionNode } from '../sessionsTree.js';

import { spawnAttachTerminal } from './startSession.js';

export interface AttachNodeDeps {
  secrets: vscode.SecretStorage;
  registry: AttachTerminalRegistry;
}

export function registerAttachNode(context: vscode.ExtensionContext, deps: AttachNodeDeps): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('relay.sessions.attachNode', async (node: SessionNode) => {
      const creds = await loadCredentials(deps.secrets);
      if (creds === undefined) {
        void vscode.window.showErrorMessage(
          'Relay is not paired. Run "Relay: Connect to server" first.',
        );
        return;
      }
      // Reuses the 6I subprocess-of-attach pattern; the registry tracks the
      // terminal so "release" can dispose it later (D-G2 rule 4).
      spawnAttachTerminal(
        {
          sessionId: node.session.id,
          rootName: node.session.id.slice(0, 8),
          creds,
        },
        deps.registry,
      );
    }),
  );
}
