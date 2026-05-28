// Per prd/04-ide-extension.md §4: focus-following indicator. Shows the
// project bound to the root containing the currently focused editor; swaps as
// the user navigates between roots in a multi-root workspace (per ND-05 rule 4).
// Click target is the attach quick-pick command (same as Relay: Attach to
// session).
//
// Per prd/04-ide-extension.md §6 (ND-33 item (i), REST-pollable part only): the
// bar also carries a running-session count fetched by REST poll. The claim-holder
// and agent-activity indicators are explicitly NOT here — they need the same
// structured `relay attach` event stream as the BUSY notice and are deferred with
// it on ND-30. Per D-G2 the extension opens no WebSocket; the count comes from a
// REST poll, never a live stream.
//
// Status updates are silent: never surface notifications on a focus change.
// Discovery failures (unknown schemaVersion, server-mismatch, malformed) are
// rendered as a short status text only; the explanatory dialogs land when the
// user invokes a command against that root.

import * as vscode from 'vscode';

import { readBinding } from './discovery.js';
import { loadCredentials } from './pairing.js';
import { PollLoop } from './poll.js';
import { RelayHttpError, RelayNetworkError, RelayRestClient } from './restClient.js';

// Result of one running-session poll. Mirrors sessionsTree's loadSessionsModel
// shape: a failed fetch is folded into an `error` value here rather than thrown,
// so the poll loop never sees a rejection (ND-37 rule 4).
export type RunningLoadResult =
  | { kind: 'unpaired' }
  | { kind: 'count'; running: number }
  | { kind: 'error'; message: string };

export interface StatusBarDeps {
  // Production wires this to the secrets-backed loader; specs inject a fake so
  // the indicator is testable with no network.
  loadRunning?: () => Promise<RunningLoadResult>;
  // Override the ND-37 cadence (specs use a small value with fake timers).
  pollIntervalMs?: number;
}

// Poll-derived running-session indicator state. `unknown` is the pre-first-poll
// and unpaired state (renders no count segment).
type RunningState =
  | { kind: 'unknown' }
  | { kind: 'count'; running: number }
  | { kind: 'error'; message: string };

export class RelayStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly subscriptions: vscode.Disposable[] = [];
  // Per ND-37 #6: the running-session indicator reuses the shared PollLoop — the
  // same cadence/teardown/error-survival contract as the sessions tree, so the
  // extension never runs two divergent timers.
  private readonly poll: PollLoop;
  private readonly loadRunning: () => Promise<RunningLoadResult>;

  // The focus-following binding segment, recomputed on editor/workspace events;
  // combined with the poll-derived running segment in render().
  private bindingText = '$(broadcast) Relay';
  private bindingTooltip = '';
  private runningState: RunningState = { kind: 'unknown' };

  constructor(
    private readonly secrets: vscode.SecretStorage,
    deps: StatusBarDeps = {},
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'relay.attachSession';
    this.item.name = 'Relay';
    this.subscriptions.push(this.item);

    this.loadRunning = deps.loadRunning ?? (() => loadRunningSessions(this.secrets));
    this.poll = new PollLoop(() => this.pollRunning(), deps.pollIntervalMs);

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
      // Per ND-37 #6 (adapted): a vscode.StatusBarItem has NO
      // onDidChangeVisibility, so the tree's visibility gating cannot be wired
      // here. Paired-state is the status bar's attention proxy instead — stop
      // the running-session poll while unpaired (cost proportional to attention,
      // ND-37 rationale) and resume it on pairing below.
      this.poll.stop();
      this.runningState = { kind: 'unknown' };
      this.bindingText = '$(broadcast) Relay: not paired';
      this.bindingTooltip = 'Run "Relay: Connect to server" to pair.';
      this.render();
      return;
    }
    // Paired → ensure the running-session poll is live (idempotent start).
    this.poll.start();
    const root = this.activeRoot();
    if (root === undefined) {
      this.bindingText = '$(broadcast) Relay';
      this.bindingTooltip = `Paired with ${creds.serverUrl}. Open a workspace folder to bind a project.`;
      this.render();
      return;
    }
    const outcome = await readBinding(root, creds.serverUrl);
    switch (outcome.kind) {
      case 'bound': {
        const label = outcome.bound.displayName ?? root.name;
        this.bindingText = `$(broadcast) Relay: ${label}`;
        this.bindingTooltip = `Bound to project ${outcome.bound.projectId} on ${outcome.bound.serverUrl}. Click to attach to a session.`;
        break;
      }
      case 'missing':
        this.bindingText = `$(broadcast) Relay: ${root.name} (unbound)`;
        this.bindingTooltip = 'Run "Relay: Start session" or "Register this workspace" to bind.';
        break;
      case 'unsupported-version':
        this.bindingText = `$(warning) Relay: marker v${String(outcome.foundVersion)}`;
        this.bindingTooltip = 'This marker was written by a newer Relay extension. Update to bind.';
        break;
      case 'server-mismatch':
        this.bindingText = `$(warning) Relay: server mismatch`;
        this.bindingTooltip = `Marker points at ${outcome.markerServerUrl}; extension paired with ${outcome.storedServerUrl}.`;
        break;
      case 'malformed':
        this.bindingText = `$(warning) Relay: malformed marker`;
        this.bindingTooltip = outcome.reason;
        break;
      case 'cancelled':
        // readBinding never returns cancelled — exhaustive switch only.
        this.bindingText = '$(broadcast) Relay';
        this.bindingTooltip = '';
        break;
    }
    this.render();
  }

  // One running-session poll tick. Never throws (loadRunning folds failures into
  // an `error` result), so the PollLoop keeps ticking per ND-37 rule 4. This tick
  // only updates the displayed count — the poll's start/stop lifecycle is owned
  // solely by refresh() (paired-state, the attention proxy), so a tick never
  // touches the timer. Out-of-band credential loss flows through the
  // secrets.onDidChange → refresh() path, which stops the poll.
  private async pollRunning(): Promise<void> {
    const result = await this.loadRunning();
    if (result.kind === 'count') {
      this.runningState = { kind: 'count', running: result.running };
    } else if (result.kind === 'error') {
      // Per ND-37 rule 4: render an informational placeholder and keep polling;
      // the next successful tick recovers the count.
      this.runningState = { kind: 'error', message: result.message };
    } else {
      // unpaired mid-poll — clear the stale count; refresh() will stop the loop.
      this.runningState = { kind: 'unknown' };
    }
    this.render();
  }

  private render(): void {
    const segment = this.runningSegment();
    this.item.text = segment === undefined ? this.bindingText : `${this.bindingText}  ${segment}`;
    this.item.tooltip = this.composeTooltip();
    this.item.show();
  }

  // Only a positive running count earns status-bar real estate; zero/unknown
  // render nothing extra. The count detail always lands in the tooltip.
  private runningSegment(): string | undefined {
    if (this.runningState.kind === 'count' && this.runningState.running > 0) {
      return `$(pulse) ${String(this.runningState.running)}`;
    }
    return undefined;
  }

  private composeTooltip(): string {
    const lines: string[] = [];
    if (this.bindingTooltip.length > 0) lines.push(this.bindingTooltip);
    if (this.runningState.kind === 'count') {
      lines.push(
        this.runningState.running === 0
          ? 'No running sessions on this server.'
          : `${String(this.runningState.running)} running session(s) on this server.`,
      );
    } else if (this.runningState.kind === 'error') {
      lines.push(`Running-session count unavailable: ${this.runningState.message}`);
    }
    return lines.join('\n');
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

  // Read-only accessors for specs to assert the rendered indicator + poll state.
  get polling(): boolean {
    return this.poll.running;
  }

  get text(): string {
    return this.item.text;
  }

  get tooltip(): string | vscode.MarkdownString | undefined {
    return this.item.tooltip;
  }

  dispose(): void {
    // Per ND-37 rule 3: tear the poll timer down so no timer outlives the host.
    this.poll.stop();
    for (const d of this.subscriptions) d.dispose();
  }
}

// Production running-session loader: unpaired when there are no credentials;
// otherwise count the running sessions and fold any REST/network failure into an
// `error` result the indicator renders inline (ND-37 rule 4). Mirrors
// sessionsTree's loadSessionsModel so the two surfaces fail the same way.
export async function loadRunningSessions(
  secrets: vscode.SecretStorage,
): Promise<RunningLoadResult> {
  const creds = await loadCredentials(secrets);
  if (creds === undefined) return { kind: 'unpaired' };
  const client = new RelayRestClient(creds);
  try {
    const res = await client.listRunningSessions();
    return { kind: 'count', running: res.items.length };
  } catch (err) {
    if (err instanceof RelayHttpError) return { kind: 'error', message: err.toUserMessage() };
    if (err instanceof RelayNetworkError) return { kind: 'error', message: err.message };
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
