// Extension entry point. Wires commands, the relay:// URI handler, the
// focus-following status bar, and the ND-33 P0 sessions tree view. Per
// arch/client-agnosticism.md §4.3 the extension never opens a WebSocket — it
// shells out to `relay attach` from PATH (D-08) and lets that subprocess own
// the §5.1 client FSM. The tree view therefore refreshes by REST poll (D-G2),
// on the ND-37 visibility-gated cadence.

import * as vscode from 'vscode';

import { handlePairingUri, registerConnectServer } from './commands/connectServer.js';
import { registerStartSession } from './commands/startSession.js';
import { registerAttachSession } from './commands/attachSession.js';
import { registerRegisterWorkspace } from './commands/registerWorkspace.js';
import { registerAttachNode } from './commands/attachNode.js';
import { registerKillNode } from './commands/killNode.js';
import { registerReleaseNode } from './commands/releaseNode.js';
import { RelayStatusBar } from './statusBar.js';
import { SessionsTreeProvider, loadSessionsModel } from './sessionsTree.js';
import { AttachTerminalRegistry } from './terminalRegistry.js';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const statusBar = new RelayStatusBar(context.secrets);
  context.subscriptions.push(statusBar);

  const connectDeps = {
    secrets: context.secrets,
    onPaired: async (): Promise<void> => {
      await statusBar.refresh();
    },
  };

  registerConnectServer(context, connectDeps);
  registerStartSession(context);
  registerAttachSession(context);
  registerRegisterWorkspace(context);

  // Sessions tree view (ND-33 P0). The registry tracks attach terminals so the
  // per-node release action can dispose them (D-G2 rule 4).
  const registry = new AttachTerminalRegistry();
  context.subscriptions.push(registry);

  const sessionsProvider = new SessionsTreeProvider({
    load: () => loadSessionsModel(context.secrets),
  });
  context.subscriptions.push(sessionsProvider);

  const sessionsView = vscode.window.createTreeView('relay.sessions', {
    treeDataProvider: sessionsProvider,
  });
  context.subscriptions.push(sessionsView);

  // Per ND-37 rule 2: poll only while the view is visible.
  context.subscriptions.push(
    sessionsView.onDidChangeVisibility((e) => {
      if (e.visible) sessionsProvider.startPolling();
      else sessionsProvider.stopPolling();
    }),
  );
  if (sessionsView.visible) sessionsProvider.startPolling();

  const refreshSessions = (): void => {
    void sessionsProvider.refresh();
  };
  context.subscriptions.push(
    vscode.commands.registerCommand('relay.sessions.refresh', refreshSessions),
  );
  registerAttachNode(context, { secrets: context.secrets, registry });
  registerReleaseNode(context, { registry });
  registerKillNode(context, { secrets: context.secrets, registry, refresh: refreshSessions });

  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri: (uri) => handlePairingUri(uri, connectDeps),
    }),
  );

  await statusBar.refresh();
}

export function deactivate(): void {
  // Subscriptions registered on ExtensionContext are disposed automatically.
}
