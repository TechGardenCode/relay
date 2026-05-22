// Per prd/04-ide-extension.md §4: focus-following indicator. Shows the
// project bound to the root containing the currently focused editor; swaps as
// the user navigates between roots in a multi-root workspace (per ND-05 rule 4).
// Click target is the attach quick-pick command (same as Relay: Attach to
// session).
//
// Status updates are silent: never surface notifications on a focus change.
// Discovery failures (unknown schemaVersion, server-mismatch, malformed) are
// rendered as a short status text only; the explanatory dialogs land when the
// user invokes a command against that root.

import * as vscode from 'vscode';

import { readBinding } from './discovery.js';
import { loadCredentials } from './pairing.js';

export class RelayStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly secrets: vscode.SecretStorage) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'relay.attachSession';
    this.item.name = 'Relay';
    this.subscriptions.push(this.item);

    this.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        void this.refresh();
      }),
    );
    this.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.refresh();
      }),
    );
    // Re-read after pairing changes — both branches (connect/forget) call
    // back into refresh() explicitly via index.ts; the secretStorage listener
    // is a defense-in-depth refresh for out-of-band changes.
    this.subscriptions.push(
      this.secrets.onDidChange((e) => {
        if (e.key === 'relay.serverUrl' || e.key === 'relay.token') {
          void this.refresh();
        }
      }),
    );
  }

  async refresh(): Promise<void> {
    const creds = await loadCredentials(this.secrets);
    if (creds === undefined) {
      this.item.text = '$(broadcast) Relay: not paired';
      this.item.tooltip = 'Run "Relay: Connect to server" to pair.';
      this.item.show();
      return;
    }
    const root = this.activeRoot();
    if (root === undefined) {
      this.item.text = '$(broadcast) Relay';
      this.item.tooltip = `Paired with ${creds.serverUrl}. Open a workspace folder to bind a project.`;
      this.item.show();
      return;
    }
    const outcome = await readBinding(root, creds.serverUrl);
    switch (outcome.kind) {
      case 'bound': {
        const label = outcome.bound.displayName ?? root.name;
        this.item.text = `$(broadcast) Relay: ${label}`;
        this.item.tooltip = `Bound to project ${outcome.bound.projectId} on ${outcome.bound.serverUrl}. Click to attach to a session.`;
        break;
      }
      case 'missing':
        this.item.text = `$(broadcast) Relay: ${root.name} (unbound)`;
        this.item.tooltip = 'Run "Relay: Start session" or "Register this workspace" to bind.';
        break;
      case 'unsupported-version':
        this.item.text = `$(warning) Relay: marker v${String(outcome.foundVersion)}`;
        this.item.tooltip = 'This marker was written by a newer Relay extension. Update to bind.';
        break;
      case 'server-mismatch':
        this.item.text = `$(warning) Relay: server mismatch`;
        this.item.tooltip = `Marker points at ${outcome.markerServerUrl}; extension paired with ${outcome.storedServerUrl}.`;
        break;
      case 'malformed':
        this.item.text = `$(warning) Relay: malformed marker`;
        this.item.tooltip = outcome.reason;
        break;
      case 'cancelled':
        // readBinding never returns cancelled — exhaustive switch only.
        this.item.text = '$(broadcast) Relay';
        break;
    }
    this.item.show();
  }

  private activeRoot(): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) return undefined;
    const editor = vscode.window.activeTextEditor;
    if (editor !== undefined) {
      const containing = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      if (containing !== undefined) return containing;
    }
    if (folders.length === 1) return folders[0];
    return undefined;
  }

  dispose(): void {
    for (const d of this.subscriptions) d.dispose();
  }
}
