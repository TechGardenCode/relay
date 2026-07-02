import { Injectable } from '@angular/core';

export type PtyBytesFn = (chunk: Uint8Array) => void;

// Per feature-modules.md §4.1 + data-layer.md §3.3: the seam the terminal
// viewport subscribes through so it never touches the socket directly. Single
// consumer per session. The ND-40 connect→subscribe replay buffer is owned by
// WsClientService (upstream) — this service does NOT buffer: a push with no
// consumer is dropped, and WsClientService only calls push() once a consumer is
// present (draining its buffer via the drain hook).
@Injectable({ providedIn: 'root' })
export class PtyOutputService {
  private onBytes: PtyBytesFn | null = null;
  private onReset: (() => void) | null = null;
  private drainHook: (() => void) | null = null;

  subscribe(onBytes: PtyBytesFn, onReset?: () => void): () => void {
    this.onBytes = onBytes;
    this.onReset = onReset ?? null;
    // Signal WsClientService to drain any ND-40-buffered replay bytes now that a
    // consumer exists (data-layer.md §3.3).
    this.drainHook?.();
    return () => {
      this.onBytes = null;
      this.onReset = null;
    };
  }

  push(chunk: Uint8Array): void {
    this.onBytes?.(chunk);
  }

  // Per D-G3: called by WsClientService at replay_start so the viewport clears
  // stale scrollback before the reattach repaint (no-op on first attach).
  reset(): void {
    this.onReset?.();
  }

  hasConsumer(): boolean {
    return this.onBytes !== null;
  }

  setDrainHook(hook: (() => void) | null): void {
    this.drainHook = hook;
  }
}
