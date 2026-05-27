// Tree per-node "release" action. Per D-G2 the extension holds no claim — the
// §5.1 claim FSM lives inside `relay attach`. The only lever the extension has
// is the lifecycle of the terminal it spawned: per D-G2 rule 4, disposing that
// terminal closes its WebSocket and the in-attach FSM performs the actual claim
// RELEASE. When the extension never spawned a terminal for this session (claim
// held by another device/window, or not attached), there is nothing to release
// and we say so rather than fake it.

import * as vscode from 'vscode';

import { type AttachTerminalRegistry } from '../terminalRegistry.js';
import { type SessionNode } from '../sessionsTree.js';

export interface ReleaseNodeDeps {
  registry: AttachTerminalRegistry;
}

export function registerReleaseNode(context: vscode.ExtensionContext, deps: ReleaseNodeDeps): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('relay.sessions.releaseNode', (node: SessionNode) => {
      // Per D-G2 rule 4: releasing = disposing the spawned attach terminal; the
      // WS-close triggers the actual claim RELEASE inside `relay attach`.
      const released = deps.registry.release(node.session.id);
      if (!released) {
        void vscode.window.showInformationMessage(
          'Relay: no attached terminal in this window to release for this session. ' +
            'The claim, if any, is held by the device that ran "relay attach" (per D-G2) — close that terminal to release it.',
        );
      }
    }),
  );
}
