// "Relay: Register this workspace as a project" — manual entry point that
// calls POST /projects for the resolved root. POST /projects writes the
// marker + appends to .gitignore server-side per D-G6 rule 4 + ND-07.

import * as vscode from 'vscode';

import { pickTargetRoot } from '../discovery.js';
import { readMarker } from '../binding.js';
import { loadCredentials } from '../pairing.js';
import { RelayHttpError, RelayNetworkError, RelayRestClient } from '../restClient.js';

export function registerRegisterWorkspace(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('relay.registerWorkspace', async () => {
      const creds = await loadCredentials(context.secrets);
      if (creds === undefined) {
        void vscode.window.showErrorMessage(
          'Relay is not paired. Run "Relay: Connect to server" first.',
        );
        return;
      }
      const root = await pickTargetRoot();
      if (root === undefined) return;

      const existing = await readMarker(root);
      if (existing.kind === 'ok') {
        void vscode.window.showInformationMessage(
          `This root is already bound to project ${existing.marker.projectId}. Edit .relay/project.json to re-bind.`,
        );
        return;
      }

      try {
        const project = new RelayRestClient(creds);
        const created = await project.createProject({ path: root.uri.fsPath });
        void vscode.window.showInformationMessage(
          `Registered ${root.name} as Relay project ${created.slug} (${created.id}).`,
        );
      } catch (err) {
        if (err instanceof RelayHttpError) {
          void vscode.window.showErrorMessage(err.toUserMessage());
        } else if (err instanceof RelayNetworkError) {
          void vscode.window.showErrorMessage(err.message);
        } else {
          void vscode.window.showErrorMessage(`Relay: ${(err as Error).message}`);
        }
      }
    }),
  );
}
