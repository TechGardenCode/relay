// "Relay: Start session in current project" — picks a persona, calls
// POST /sessions, opens a terminal pane running `relay attach <id>` per D-08
// (single binary on PATH) + arch/client-agnosticism.md §4.3 (subprocess-of-
// attach pattern).
//
// Target root resolution per ND-05: active editor's containing root, falling
// back to a quick-pick over multiple roots. cwd per D-01: workspace root, no
// subdirectory pre-prompt.

import * as vscode from 'vscode';

import { pickTargetRoot, renderResolveFailure, resolveRootForCommand } from '../discovery.js';
import { loadCredentials } from '../pairing.js';
import {
  RelayHttpError,
  RelayNetworkError,
  RelayRestClient,
  type RelayCredentials,
} from '../restClient.js';
import { type AttachTerminalRegistry } from '../terminalRegistry.js';

export function registerStartSession(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('relay.startSession', async () => {
      const creds = await loadCredentials(context.secrets);
      if (creds === undefined) {
        void vscode.window.showErrorMessage(
          'Relay is not paired. Run "Relay: Connect to server" first.',
        );
        return;
      }
      const root = await pickTargetRoot();
      if (root === undefined) return;
      const client = new RelayRestClient(creds);
      const outcome = await resolveRootForCommand(root, client);
      if (outcome.kind !== 'bound') {
        renderResolveFailure(outcome);
        return;
      }
      const persona = await pickPersona(client);
      if (persona === undefined) return;
      try {
        const session = await client.createSession({
          projectId: outcome.bound.projectId,
          personaName: persona,
        });
        spawnAttachTerminal({
          sessionId: session.id,
          personaName: persona,
          rootName: root.name,
          creds,
        });
      } catch (err) {
        renderSessionError(err);
      }
    }),
  );
}

async function pickPersona(client: RelayRestClient): Promise<string | undefined> {
  let response;
  try {
    response = await client.listPersonas();
  } catch (err) {
    renderSessionError(err);
    return undefined;
  }
  if (response.items.length === 0) {
    void vscode.window.showErrorMessage(
      'No personas available on this Relay server. Use `relay persona create` or add one to ~/.relay/personas/.',
    );
    return undefined;
  }
  const items = response.items.map((p) => ({
    label: p.name,
    description: p.description,
    detail: `${p.source} · ${p.filePath}`,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Pick a persona',
    matchOnDescription: true,
  });
  return picked?.label;
}

interface SpawnArgs {
  sessionId: string;
  personaName: string;
  rootName: string;
  creds: RelayCredentials;
}

// Per D-08 + prd/03-server.md §7: spawn the bundled `relay` binary on PATH.
// Per D-13: the bearer token rides via RELAY_TOKEN env var (recognized by
// attach/config.ts:71-72); the server URL rides via --url so the spawned
// attach hits the same server the extension is paired with.
//
// Returns the terminal and, when a registry is passed, tracks it by session id
// so the sessions tree's "release" action can dispose it later (per D-G2 rule 4
// the WS-close performs the actual claim release inside `relay attach`).
function spawnAttachTerminal(args: SpawnArgs, registry?: AttachTerminalRegistry): vscode.Terminal {
  const terminal = vscode.window.createTerminal({
    name: `Relay: ${args.personaName} · ${args.rootName}`,
    shellPath: 'relay',
    shellArgs: ['attach', args.sessionId, '--url', args.creds.serverUrl],
    env: { RELAY_TOKEN: args.creds.token },
    isTransient: true,
  });
  terminal.show();
  registry?.track(args.sessionId, terminal);
  return terminal;
}

function renderSessionError(err: unknown): void {
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

export { spawnAttachTerminal };
