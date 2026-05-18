// Per-session claim-lock FSM. Authoritative shape lives in
// docs/arch/ws-protocol.md §5.2; the four race transitions in §5.3 are the
// test contract.
//
// This module is socket-agnostic: the WS handler calls into the FSM with
// connection ids and reacts to the returned transition records by emitting
// claim_ack / busy / error / claim_released frames. Keeping the FSM pure
// makes the four §5.3 races exercisable with fake timers and no WebSocket.

import type { ClaimReleasedReason } from '@relay/protocol';

export type { ClaimReleasedReason };

export interface ClaimGranted {
  ok: true;
  expiresAt: string;
  // The granted-at timestamp Carried to the `busy.since` field on a later
  // reject (§2.3).
  sinceIso: string;
}

export interface ClaimRejected {
  ok: false;
  // ISO-8601 of when the active claim was granted. Echoed in `busy.since`.
  sinceIso: string;
}

export type ClaimResult = ClaimGranted | ClaimRejected;

export interface ClaimReleasedEvent {
  heldBy: string;
  reason: ClaimReleasedReason;
}

export interface ClaimLockHooks {
  // Fired exactly once per Unclaimed-from-ClaimedBy transition. The WS
  // handler turns this into a broadcast (§5.2: "broadcast claim_released to
  // all connections"). The lock never broadcasts itself — that surface lives
  // in the handler, which owns the connection set.
  onReleased: (event: ClaimReleasedEvent) => void;
  // Test seam: monotonic clock override. Production uses `Date.now()`.
  now?: () => number;
}

interface ClaimedState {
  kind: 'claimed';
  connId: string;
  expiresAtMs: number;
  sinceMs: number;
  timer: ReturnType<typeof setTimeout>;
}

interface UnclaimedState {
  kind: 'unclaimed';
}

type LockState = UnclaimedState | ClaimedState;

export interface ClaimLock {
  // Per §5.2 row 1 + ND-01: grant if Unclaimed; per §2.3 idempotency: a
  // duplicate claim from the active holder returns the ORIGINAL expiresAt
  // (no re-arming on activity). Per row 2: any other connection sees busy.
  tryClaim(connId: string): ClaimResult;
  // Per §5.2 rows 4–7 + the `send_without_claim` / `release_without_claim`
  // error codes (§4.1). Returns `not_holder` so the handler can emit the
  // matching error frame; returns `released` after firing `onReleased`.
  releaseAsHolder(connId: string, reason: ClaimReleasedReason): { ok: true } | { ok: false };
  // Per §5.2 row 8 (disconnect) — same semantics as releaseAsHolder, but
  // silent on `not_holder`. The connection is gone; there is no socket to
  // receive `release_without_claim`.
  releaseOnDisconnect(connId: string): void;
  // Per §5.2 final row + §2.3 `session_ended`: force-release on terminal
  // events. No-op when unclaimed. Used for session_ended / server_shutdown
  // / auth_expired-of-holder paths.
  releaseAll(reason: ClaimReleasedReason): void;
  // Read-only view for the handler's `send_without_claim` predicate.
  isHolder(connId: string): boolean;
  currentHolder(): string | undefined;
  // Disposes the active timeout, if any. Called from the handler when the
  // lock is being torn down at session-end / server-shutdown to avoid leaked
  // setTimeout handles. Idempotent.
  dispose(): void;
}

export interface CreateClaimLockOptions {
  // Per ND-01 + ws-protocol.md §7: single fixed window from grant time, no
  // re-arming on activity. Operators set this via `~/.relay/config.yaml`
  // `claimLockTimeoutSeconds`; the handler passes the resolved value.
  timeoutSeconds: number;
  hooks: ClaimLockHooks;
}

export function createClaimLock(opts: CreateClaimLockOptions): ClaimLock {
  const timeoutMs = opts.timeoutSeconds * 1000;
  const now = opts.hooks.now ?? Date.now;
  let state: LockState = { kind: 'unclaimed' };

  function clearTimer(): void {
    if (state.kind === 'claimed') {
      clearTimeout(state.timer);
    }
  }

  function unclaim(): void {
    clearTimer();
    state = { kind: 'unclaimed' };
  }

  function fireReleased(prev: ClaimedState, reason: ClaimReleasedReason): void {
    // Capture the holder id before mutating state so re-entrant hook
    // callbacks see the post-release `unclaimed` view.
    const heldBy = prev.connId;
    unclaim();
    try {
      opts.hooks.onReleased({ heldBy, reason });
    } catch {
      // Defensive: a throwing hook must not corrupt the lock's invariants.
    }
  }

  return {
    tryClaim(connId: string): ClaimResult {
      if (state.kind === 'unclaimed') {
        const sinceMs = now();
        const expiresAtMs = sinceMs + timeoutMs;
        // Per ND-01: the timer fires `timeout` after exactly timeoutSeconds.
        const timer = setTimeout(() => {
          // The current state may have changed before the timer fired
          // (delivered / disconnect / voluntary all clear the timer); but
          // this listener only runs while it is still active.
          if (state.kind === 'claimed' && state.connId === connId) {
            fireReleased(state, 'timeout');
          }
        }, timeoutMs);
        // Per Phase 0: do not let a stray timer keep Node alive when the
        // process is otherwise idle. The handler unrefs the timer here.
        if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
          (timer as { unref(): void }).unref();
        }
        state = {
          kind: 'claimed',
          connId,
          expiresAtMs,
          sinceMs,
          timer,
        };
        return {
          ok: true,
          expiresAt: new Date(expiresAtMs).toISOString(),
          sinceIso: new Date(sinceMs).toISOString(),
        };
      }
      // state.kind === 'claimed'
      if (state.connId === connId) {
        // Per §2.3 (claim_ack idempotency) + ND-01 "no re-arming": duplicate
        // claim from the holder returns the original expiresAt verbatim.
        return {
          ok: true,
          expiresAt: new Date(state.expiresAtMs).toISOString(),
          sinceIso: new Date(state.sinceMs).toISOString(),
        };
      }
      // Per §5.2 row 2: another connection holds the lock.
      return {
        ok: false,
        sinceIso: new Date(state.sinceMs).toISOString(),
      };
    },

    releaseAsHolder(connId, reason): { ok: true } | { ok: false } {
      if (state.kind !== 'claimed') return { ok: false };
      if (state.connId !== connId) return { ok: false };
      fireReleased(state, reason);
      return { ok: true };
    },

    releaseOnDisconnect(connId): void {
      if (state.kind !== 'claimed') return;
      if (state.connId !== connId) return;
      fireReleased(state, 'disconnect');
    },

    releaseAll(reason): void {
      if (state.kind !== 'claimed') return;
      fireReleased(state, reason);
    },

    isHolder(connId): boolean {
      return state.kind === 'claimed' && state.connId === connId;
    },

    currentHolder(): string | undefined {
      return state.kind === 'claimed' ? state.connId : undefined;
    },

    dispose(): void {
      // Used by the handler at session-end so a still-armed timer does not
      // fire after the lock has been removed from the session map.
      clearTimer();
      state = { kind: 'unclaimed' };
    },
  };
}
