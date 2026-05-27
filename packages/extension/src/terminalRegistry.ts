// Tracks the `relay attach` terminals the extension itself spawned, keyed by
// session id. This is window-local bookkeeping, NOT claim state: per D-G2 the
// §5.1 claim FSM lives inside `relay attach`, and the extension never opens a
// WebSocket. The map exists only so the sessions tree's "release" action can
// dispose the terminal it created — per D-G2 rule 4, closing the attach
// subprocess closes its WebSocket, and the in-attach FSM performs the actual
// claim RELEASE. The extension cannot release a claim it never proxied.

import * as vscode from 'vscode';

export class AttachTerminalRegistry implements vscode.Disposable {
  private readonly terminals = new Map<string, vscode.Terminal>();
  private readonly subscription: vscode.Disposable;

  constructor() {
    // A terminal the user closes by hand is no longer ours to release; evict it
    // so a later "release" on the same session reports honestly (no-op + notice).
    this.subscription = vscode.window.onDidCloseTerminal((closed) => {
      for (const [sessionId, terminal] of this.terminals) {
        if (terminal === closed) this.terminals.delete(sessionId);
      }
    });
  }

  track(sessionId: string, terminal: vscode.Terminal): void {
    this.terminals.set(sessionId, terminal);
  }

  has(sessionId: string): boolean {
    return this.terminals.has(sessionId);
  }

  // Per D-G2 rule 4: disposing the spawned terminal closes its WS; the in-attach
  // FSM releases the claim. Returns false when the extension holds no terminal
  // for the session (claim held by another device/window, or never attached).
  release(sessionId: string): boolean {
    const terminal = this.terminals.get(sessionId);
    if (terminal === undefined) return false;
    this.terminals.delete(sessionId);
    terminal.dispose();
    return true;
  }

  dispose(): void {
    this.subscription.dispose();
    this.terminals.clear();
  }
}
