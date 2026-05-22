// First-run pairing flow per D-13: accept either a `relay://pair?url=…&token=…`
// deep link or URL + token entered separately. Validates by authenticated
// probe (GET /tenants/self) and stores the credentials in vscode.SecretStorage.
//
// Per ND-31 (open): SecretStorage uses single-server keys at MVP. A second
// paired server would overwrite the first; markers carrying a serverUrl that
// does not match the stored one are refused-to-bind by discovery.ts. The
// multi-server scheme (per-server-URL-hashed keys) is captured in ND-31.

import * as vscode from 'vscode';

import { RelayHttpError, RelayNetworkError, RelayRestClient } from './restClient.js';

const SECRET_KEY_URL = 'relay.serverUrl';
const SECRET_KEY_TOKEN = 'relay.token';

export interface StoredCredentials {
  serverUrl: string;
  token: string;
}

// Per D-13: the `relay://pair?...` URL is the single-token-payload deep link
// `relay init` emits. The url+token form is the fallback for terminals that
// don't honor URL handlers or IDEs that strip query strings on paste.
export interface PairingInput {
  serverUrl: string;
  token: string;
}

const PAIR_URL_PREFIX = 'relay://pair';

export function parsePairingUrl(input: string): PairingInput | undefined {
  const trimmed = input.trim();
  if (!trimmed.startsWith(PAIR_URL_PREFIX)) return undefined;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  const serverUrl = url.searchParams.get('url');
  const token = url.searchParams.get('token');
  if (serverUrl === null || serverUrl === '' || token === null || token === '') return undefined;
  return { serverUrl, token };
}

export async function loadCredentials(
  secrets: vscode.SecretStorage,
): Promise<StoredCredentials | undefined> {
  const [serverUrl, token] = await Promise.all([
    secrets.get(SECRET_KEY_URL),
    secrets.get(SECRET_KEY_TOKEN),
  ]);
  if (serverUrl === undefined || token === undefined) return undefined;
  return { serverUrl, token };
}

export async function storeCredentials(
  secrets: vscode.SecretStorage,
  creds: StoredCredentials,
): Promise<void> {
  await Promise.all([
    secrets.store(SECRET_KEY_URL, creds.serverUrl),
    secrets.store(SECRET_KEY_TOKEN, creds.token),
  ]);
}

export async function clearCredentials(secrets: vscode.SecretStorage): Promise<void> {
  await Promise.all([secrets.delete(SECRET_KEY_URL), secrets.delete(SECRET_KEY_TOKEN)]);
}

// Per D-13 rule 2: validate via GET /tenants/self. 200 = paired; 401 = bad
// token. Anything else surfaces verbatim so the operator can diagnose.
export async function probeCredentials(
  creds: StoredCredentials,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = new RelayRestClient(creds);
  try {
    await client.getTenantsSelf();
    return { ok: true };
  } catch (err) {
    if (err instanceof RelayHttpError) {
      if (err.status === 401) {
        return { ok: false, reason: 'Token rejected by server (401). Re-pair with a fresh token.' };
      }
      return { ok: false, reason: err.toUserMessage() };
    }
    if (err instanceof RelayNetworkError) {
      return { ok: false, reason: err.message };
    }
    return { ok: false, reason: (err as Error).message };
  }
}

// Interactive flow used by the "Relay: Connect to server" command. Returns
// undefined if the user cancelled.
export async function promptForPairing(): Promise<PairingInput | undefined> {
  const choice = await vscode.window.showQuickPick(
    [
      {
        label: 'Paste a relay://pair URL',
        description: 'From `relay init` output or ~/.relay/last-pairing.txt',
      },
      { label: 'Enter server URL and token separately', description: 'Two-step prompt' },
    ],
    { placeHolder: 'How do you want to pair?' },
  );
  if (choice === undefined) return undefined;
  if (choice.label === 'Paste a relay://pair URL') {
    const pasted = await vscode.window.showInputBox({
      prompt: 'Paste the relay://pair?... URL from `relay init`',
      placeHolder: 'relay://pair?url=https://...&token=01H...',
      ignoreFocusOut: true,
    });
    if (pasted === undefined) return undefined;
    const parsed = parsePairingUrl(pasted);
    if (parsed === undefined) {
      void vscode.window.showErrorMessage(
        'That does not look like a relay://pair?url=…&token=… URL. Try the URL + token form instead.',
      );
      return undefined;
    }
    return parsed;
  }
  const serverUrl = await vscode.window.showInputBox({
    prompt: 'Relay server URL',
    placeHolder: 'https://relay.homelab.lan',
    ignoreFocusOut: true,
    validateInput: (v) => {
      if (v.trim() === '') return 'URL is required';
      try {
        new URL(v.trim());
        return undefined;
      } catch {
        return 'Not a valid URL';
      }
    },
  });
  if (serverUrl === undefined) return undefined;
  const token = await vscode.window.showInputBox({
    prompt: 'Bearer token (from `relay init` or `relay token create`)',
    password: true,
    ignoreFocusOut: true,
    validateInput: (v) => (v.trim() === '' ? 'Token is required' : undefined),
  });
  if (token === undefined) return undefined;
  return { serverUrl: serverUrl.trim(), token: token.trim() };
}
