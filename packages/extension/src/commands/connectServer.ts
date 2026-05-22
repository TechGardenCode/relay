// "Relay: Connect to server" — first-run pairing entry point (D-13). Accepts
// the relay://pair?... URL or URL+token, probes via GET /tenants/self, stores
// on success in SecretStorage.
//
// Also handles the `vscode://relay.relay/` URI hook: when a user clicks a
// relay://pair link in a browser, the OS routes it to the IDE; the extension
// receives it via the URI handler registered in index.ts and forwards the
// query string to this command's pairing path.

import * as vscode from 'vscode';

import {
  clearCredentials,
  loadCredentials,
  parsePairingUrl,
  probeCredentials,
  promptForPairing,
  storeCredentials,
  type PairingInput,
} from '../pairing.js';

export interface ConnectServerDeps {
  secrets: vscode.SecretStorage;
  onPaired: () => void | Promise<void>;
}

export function registerConnectServer(
  context: vscode.ExtensionContext,
  deps: ConnectServerDeps,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('relay.connectServer', async () => {
      await runConnect(deps);
    }),
  );
}

export async function runConnect(deps: ConnectServerDeps, prefill?: PairingInput): Promise<void> {
  const existing = await loadCredentials(deps.secrets);
  if (existing !== undefined && prefill === undefined) {
    const choice = await vscode.window.showQuickPick(
      [
        { label: 'Re-pair with a new server or token', action: 'repair' as const },
        { label: 'Forget the current pairing', action: 'forget' as const },
      ],
      {
        placeHolder: `Already paired with ${existing.serverUrl}. What do you want to do?`,
      },
    );
    if (choice === undefined) return;
    if (choice.action === 'forget') {
      await clearCredentials(deps.secrets);
      void vscode.window.showInformationMessage('Forgot Relay pairing.');
      await deps.onPaired();
      return;
    }
  }

  const input = prefill ?? (await promptForPairing());
  if (input === undefined) return;

  const probe = await probeCredentials(input);
  if (!probe.ok) {
    void vscode.window.showErrorMessage(`Could not pair: ${probe.reason}`);
    return;
  }
  await storeCredentials(deps.secrets, input);
  void vscode.window.showInformationMessage(`Paired with ${input.serverUrl}.`);
  await deps.onPaired();
}

// Wired into vscode.window.registerUriHandler in index.ts so the OS-level
// relay://pair?url=…&token=… deep link drops the user straight into the
// probe. The URI handler receives `vscode://relay.relay/` URLs, but we accept
// both the canonical relay://pair shape and any URI carrying the same query
// params — so a user who pastes the URL into the browser bar lands here.
export async function handlePairingUri(uri: vscode.Uri, deps: ConnectServerDeps): Promise<void> {
  // The OS-level relay://pair?url=…&token=… is parsed by parsePairingUrl;
  // vscode://<publisher>.<name>/ URIs carry the same query params on `path`.
  const reconstructed = `relay://pair?${uri.query}`;
  const parsed = parsePairingUrl(reconstructed) ?? parsePairingUrl(uri.toString());
  if (parsed === undefined) {
    void vscode.window.showErrorMessage(
      `Could not parse pairing URI: ${uri.toString()}. Expected relay://pair?url=…&token=…`,
    );
    return;
  }
  await runConnect(deps, parsed);
}
