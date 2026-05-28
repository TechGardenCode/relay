// The shared REST-poll timer for every live extension surface. Per ND-37 #6 the
// extension runs ONE poll contract — a 5s interval that fires an immediate tick
// on start, is idempotent (never two timers), tears down on stop, and survives a
// rejected tick rather than killing the loop (ND-37 rule 4) — reused verbatim by
// the sessions tree (sessionsTree.ts) and the status-bar running-session
// indicator (statusBar.ts) so the two surfaces can never diverge into separate
// timers. Per D-G2 a timer is the only live mechanism available: the extension
// opens no WebSocket; the claim FSM stays inside `relay attach`.

// Per ND-37 rule 1: 5s is the cheapest cadence that keeps lifecycle status
// feeling live without hammering the server.
export const POLL_INTERVAL_MS = 5000;

export class PollLoop {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly tick: () => void | Promise<void>,
    private readonly intervalMs: number = POLL_INTERVAL_MS,
  ) {}

  // Per ND-37 rule 2: an immediate tick on becoming active, then on cadence.
  // Idempotent — a second call while running is a no-op (no duplicate timer).
  start(): void {
    if (this.timer !== undefined) return;
    void this.run();
    this.timer = setInterval(() => {
      void this.run();
    }, this.intervalMs);
  }

  // Per ND-37 rule 3: the interval handle is cleared on teardown so no timer
  // outlives the surface (and, via dispose chains, the extension host).
  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  get running(): boolean {
    return this.timer !== undefined;
  }

  private async run(): Promise<void> {
    // Per ND-37 rule 4: a rejected tick must never escape into the interval
    // callback and tear the loop down. Each surface renders its own error
    // placeholder; the loop's job is only to guarantee it keeps ticking.
    try {
      await this.tick();
    } catch {
      // Swallowed by contract — recovery is the next successful tick.
    }
  }
}
