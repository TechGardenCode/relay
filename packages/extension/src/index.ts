// Extension entry point. Wires commands, the relay:// URI handler, and the
// focus-following status bar. Per arch/client-agnosticism.md §4.3 the
// extension never opens a WebSocket — it shells out to `relay attach` from
// PATH (D-08) and lets that subprocess own the §5.1 client FSM.

import * as vscode from 'vscode';

import { handlePairingUri, registerConnectServer } from './commands/connectServer.js';
import { registerStartSession } from './commands/startSession.js';
import { registerAttachSession } from './commands/attachSession.js';
import { registerRegisterWorkspace } from './commands/registerWorkspace.js';
import { RelayStatusBar } from './statusBar.js';

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
