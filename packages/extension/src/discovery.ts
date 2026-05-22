// Per-root bind resolver. Driven by ND-05 (per-root) + D-G6 (marker is the
// sole bind signal) + ND-07 (marker schema, refuse-to-bind on unknown
// schemaVersion) + ND-31-open (single-server keys, refuse-to-bind on
// serverUrl mismatch).
//
// Discovery is on-demand. There is no auto-popup-on-workspace-open — that
// would be intrusive for users who use the workspace without Relay. Commands
// call `resolveRootForCommand(root)` when they need a projectId; resolution
// reads the marker, falls back to a quick-pick (register-new ∣ bind-existing),
// and on success writes the marker (for the bind-existing branch only; the
// register-new branch lets POST /projects write the marker server-side per
// D-G6 rule 4 + projects.ts §46-58).

import * as vscode from 'vscode';

import { readMarker, writeMarker, type MarkerV1 } from './binding.js';
import { type RelayRestClient } from './restClient.js';

export interface BoundProject {
  root: vscode.WorkspaceFolder;
  projectId: string;
  serverUrl: string;
  displayName?: string;
}

export type ResolveOutcome =
  | { kind: 'bound'; bound: BoundProject }
  | { kind: 'cancelled' }
  | { kind: 'unsupported-version'; foundVersion: number }
  | { kind: 'server-mismatch'; markerServerUrl: string; storedServerUrl: string }
  | { kind: 'malformed'; reason: string };

// Resolve the binding for a single root. Pure read — does not surface UI.
// Used by the status bar (which should be silent on focus change) and as the
// fast-path inside resolveRootForCommand (which falls back to UI on missing).
export async function readBinding(
  root: vscode.WorkspaceFolder,
  storedServerUrl: string,
): Promise<ResolveOutcome | { kind: 'missing' }> {
  const result = await readMarker(root);
  switch (result.kind) {
    case 'ok': {
      // Per ND-31 (open): single-server posture at MVP. A marker whose
      // serverUrl does not match the stored one surfaces a refuse-to-bind
      // outcome the caller renders ("pair with this server first").
      const markerServerUrl = result.marker.serverUrl;
      if (markerServerUrl !== undefined && markerServerUrl !== storedServerUrl) {
        return {
          kind: 'server-mismatch',
          markerServerUrl,
          storedServerUrl,
        };
      }
      return {
        kind: 'bound',
        bound: {
          root,
          projectId: result.marker.projectId,
          serverUrl: markerServerUrl ?? storedServerUrl,
          displayName: result.marker.displayName,
        },
      };
    }
    case 'missing':
      return { kind: 'missing' };
    case 'unsupported-version':
      return { kind: 'unsupported-version', foundVersion: result.foundVersion };
    case 'malformed':
      return { kind: 'malformed', reason: result.reason };
  }
}

// Resolve the binding for a command. Surfaces the missing-marker quick-pick
// (register-new ∣ bind-existing) per D-G6 rule 3. Returns 'cancelled' if the
// user dismisses without choosing.
export async function resolveRootForCommand(
  root: vscode.WorkspaceFolder,
  client: RelayRestClient,
): Promise<ResolveOutcome> {
  const initial = await readBinding(root, client.serverUrl);
  if (initial.kind !== 'missing') return initial;

  // Per D-G6: missing marker → user choice. Per ND-05: the quick-pick is
  // scoped to *this root*, not the workspace as a whole.
  const choice = await vscode.window.showQuickPick(
    [
      {
        label: 'Register this root as a new Relay project',
        description: root.uri.fsPath,
        action: 'register' as const,
      },
      {
        label: 'Bind to an existing project on the server',
        description: 'Pick from projects already registered on this server',
        action: 'bind' as const,
      },
    ],
    {
      placeHolder: `Relay is not bound for ${root.name}. How do you want to proceed?`,
      ignoreFocusOut: true,
    },
  );
  if (choice === undefined) return { kind: 'cancelled' };

  if (choice.action === 'register') {
    const project = await client.createProject({ path: root.uri.fsPath });
    // POST /projects writes the marker + appends .gitignore server-side
    // (projects.ts:48-58). Read it back to surface the canonical state.
    const after = await readBinding(root, client.serverUrl);
    if (after.kind === 'bound') return after;
    // Defensive fallback if the server-side marker write raced filesystem
    // sync — return what we know directly so the command can proceed.
    return {
      kind: 'bound',
      bound: {
        root,
        projectId: project.id,
        serverUrl: client.serverUrl,
        displayName: project.displayName,
      },
    };
  }

  // bind-existing branch
  const projects = await client.listProjects();
  if (projects.length === 0) {
    void vscode.window.showInformationMessage(
      'No projects exist on this Relay server yet. Choose "Register this root" instead.',
    );
    return { kind: 'cancelled' };
  }
  const picked = await vscode.window.showQuickPick(
    projects.map((p) => ({
      label: p.displayName,
      description: `${p.slug} · ${p.canonicalPath}`,
      project: p,
    })),
    {
      placeHolder: 'Pick the existing project to bind this root to',
      ignoreFocusOut: true,
    },
  );
  if (picked === undefined) return { kind: 'cancelled' };
  const marker: MarkerV1 = {
    schemaVersion: 1,
    projectId: picked.project.id,
    serverUrl: client.serverUrl,
    displayName: picked.project.displayName,
  };
  await writeMarker(root, marker);
  return {
    kind: 'bound',
    bound: {
      root,
      projectId: picked.project.id,
      serverUrl: client.serverUrl,
      displayName: picked.project.displayName,
    },
  };
}

// Per ND-05: "Start session" resolves its target by finding the root that
// contains the active editor's URI. Falls back to a quick-pick over roots
// when no editor is active or the URI is outside all roots.
export async function pickTargetRoot(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    void vscode.window.showErrorMessage(
      'Open a folder or workspace before starting a Relay session.',
    );
    return undefined;
  }
  if (folders.length === 1) return folders[0];

  const editor = vscode.window.activeTextEditor;
  if (editor !== undefined) {
    const containing = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (containing !== undefined) return containing;
  }
  const picked = await vscode.window.showQuickPick(
    folders.map((f) => ({ label: f.name, description: f.uri.fsPath, folder: f })),
    { placeHolder: 'Which workspace root?' },
  );
  return picked?.folder;
}

// Surfacing helpers — keep messages co-located with the discovery outcomes so
// every caller renders them consistently.
export function renderResolveFailure(outcome: ResolveOutcome): void {
  switch (outcome.kind) {
    case 'bound':
    case 'cancelled':
      return;
    case 'unsupported-version':
      // Per ND-07 rule 5: refuse-to-bind on unknown schemaVersion with an
      // explicit upgrade prompt.
      void vscode.window.showErrorMessage(
        `This .relay/project.json was written with schemaVersion ${String(outcome.foundVersion)}, which this Relay extension does not understand. Update your Relay extension and try again.`,
      );
      return;
    case 'server-mismatch':
      // Per ND-31 (open): single-server posture at MVP. Direct the user to
      // pair with the marker's server before binding this root.
      void vscode.window.showErrorMessage(
        `This workspace's .relay/project.json points at ${outcome.markerServerUrl}, but Relay is paired with ${outcome.storedServerUrl}. Pair with the marker's server (Relay: Connect to server) and reload, or update the marker.`,
      );
      return;
    case 'malformed':
      void vscode.window.showErrorMessage(
        `This workspace's .relay/project.json could not be parsed: ${outcome.reason}`,
      );
      return;
  }
}
