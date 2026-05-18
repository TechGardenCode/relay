/**
 * Coverage map — docs/arch/ws-protocol.md §5.2 (server lock state) + §5.3
 * (tricky races). The ClaimLock FSM owns these transitions; the WS handler
 * (handler.test.ts) only exercises the JSON-frame wiring on top.
 *
 *   §5.2 row 1 — Unclaimed + claim(X) → ClaimedBy(X)        → describe("tryClaim") > it("...grants...")
 *   §5.2 row 2 — ClaimedBy(X) + claim(Y) → busy             → describe("tryClaim") > it("rejects a second claim with sinceIso of the active grant")
 *   §5.2 row 3 — ClaimedBy(X) + claim(X) → idempotent       → describe("tryClaim") > it("duplicate claim from holder returns ORIGINAL expiresAt (ND-01 no re-arm)")
 *   §5.2 row 4 — ClaimedBy(X) + send→PTY → released:delivered → describe("releaseAsHolder") > it("delivered fires onReleased")
 *   §5.2 row 5 — ClaimedBy(X) + send from Y → error         → exercised by isHolder check in handler; here we cover releaseAsHolder({not_holder})
 *   §5.2 row 6 — ClaimedBy(X) + release(X) → released:voluntary
 *   §5.2 row 7 — ClaimedBy(X) + release(Y) → error          → releaseAsHolder({not_holder})
 *   §5.2 row 8 — Timeout                                    → describe("ND-01 timeout") > it("...")
 *   §5.2 row 9 — WS close                                   → describe("releaseOnDisconnect") > it("...")
 *   §5.2 final — Session ended                              → describe("releaseAll")
 *
 *   §5.3 race 1 — Two simultaneous claims                   → describe("§5.3 race 1") — first-arrival-wins under single-threaded loop
 *   §5.3 race 2 — Disconnect mid-send                       → covered by handler.test.ts (PTY-side concern)
 *   §5.3 race 3 — Auth expired mid-claim                    → covered by handler.test.ts (disconnect path subsumes; auth handled in handler)
 *   §5.3 race 4 — PTY EPIPE on send                         → covered by handler.test.ts (PTY-side concern)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createClaimLock, type ClaimReleasedEvent } from './claim-lock.js';

interface Recorder {
  events: ClaimReleasedEvent[];
}

function makeRecorder(): Recorder {
  return { events: [] };
}

const TIMEOUT_SECONDS = 30;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createClaimLock — tryClaim (ws-protocol.md §5.2 rows 1–3)', () => {
  it('row 1: Unclaimed + claim(X) → grants with expiresAt = now + timeoutSeconds', () => {
    vi.setSystemTime(new Date('2026-05-15T14:00:00.000Z'));
    const rec = makeRecorder();
    const lock = createClaimLock({
      timeoutSeconds: TIMEOUT_SECONDS,
      hooks: { onReleased: (e) => rec.events.push(e) },
    });

    const result = lock.tryClaim('conn-A');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.expiresAt).toBe('2026-05-15T14:00:30.000Z');
    expect(lock.currentHolder()).toBe('conn-A');
  });

  it('row 2: ClaimedBy(X) + claim(Y) → busy with sinceIso of the active grant', () => {
    vi.setSystemTime(new Date('2026-05-15T14:00:00.000Z'));
    const rec = makeRecorder();
    const lock = createClaimLock({
      timeoutSeconds: TIMEOUT_SECONDS,
      hooks: { onReleased: (e) => rec.events.push(e) },
    });
    lock.tryClaim('conn-A');
    vi.setSystemTime(new Date('2026-05-15T14:00:05.000Z'));
    const result = lock.tryClaim('conn-B');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Per §2.3 busy.since: the timestamp of the ACTIVE grant, not the
    // rejected claim — so 14:00:00, not 14:00:05.
    expect(result.sinceIso).toBe('2026-05-15T14:00:00.000Z');
    // §5.2 row 2: no state change; conn-A still holds.
    expect(lock.currentHolder()).toBe('conn-A');
    expect(rec.events).toHaveLength(0);
  });

  it('row 3: duplicate claim from holder returns ORIGINAL expiresAt (ND-01 no re-arming)', () => {
    vi.setSystemTime(new Date('2026-05-15T14:00:00.000Z'));
    const rec = makeRecorder();
    const lock = createClaimLock({
      timeoutSeconds: TIMEOUT_SECONDS,
      hooks: { onReleased: (e) => rec.events.push(e) },
    });
    const first = lock.tryClaim('conn-A');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstExpiresAt = first.expiresAt;

    vi.setSystemTime(new Date('2026-05-15T14:00:20.000Z'));
    const second = lock.tryClaim('conn-A');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    // Per ND-01 + ws-protocol.md §2.3: a duplicate claim from the holder
    // returns the ORIGINAL expiresAt — pinging cannot extend a claim.
    expect(second.expiresAt).toBe(firstExpiresAt);
  });
});

describe('createClaimLock — releaseAsHolder (ws-protocol.md §5.2 rows 4, 6, 7)', () => {
  it('row 4: delivered fires onReleased({reason: delivered, heldBy: X})', () => {
    const rec = makeRecorder();
    const lock = createClaimLock({
      timeoutSeconds: TIMEOUT_SECONDS,
      hooks: { onReleased: (e) => rec.events.push(e) },
    });
    lock.tryClaim('conn-A');
    const r = lock.releaseAsHolder('conn-A', 'delivered');
    expect(r.ok).toBe(true);
    expect(rec.events).toEqual([{ heldBy: 'conn-A', reason: 'delivered' }]);
    expect(lock.currentHolder()).toBeUndefined();
  });

  it('row 6: voluntary release by holder fires onReleased({reason: voluntary})', () => {
    const rec = makeRecorder();
    const lock = createClaimLock({
      timeoutSeconds: TIMEOUT_SECONDS,
      hooks: { onReleased: (e) => rec.events.push(e) },
    });
    lock.tryClaim('conn-A');
    const r = lock.releaseAsHolder('conn-A', 'voluntary');
    expect(r.ok).toBe(true);
    expect(rec.events).toEqual([{ heldBy: 'conn-A', reason: 'voluntary' }]);
  });

  it('row 7: release from non-holder returns ok=false and does not transition state', () => {
    const rec = makeRecorder();
    const lock = createClaimLock({
      timeoutSeconds: TIMEOUT_SECONDS,
      hooks: { onReleased: (e) => rec.events.push(e) },
    });
    lock.tryClaim('conn-A');
    // Per §4.1: a release from a non-holder is `release_without_claim` —
    // the handler emits the error frame from this ok=false result.
    const r = lock.releaseAsHolder('conn-B', 'voluntary');
    expect(r.ok).toBe(false);
    expect(lock.currentHolder()).toBe('conn-A');
    expect(rec.events).toEqual([]);
  });
});

describe('createClaimLock — ND-01 timeout (ws-protocol.md §5.2 row 8 + §7)', () => {
  it('fires onReleased({reason: timeout}) after timeoutSeconds with no activity', () => {
    vi.setSystemTime(new Date('2026-05-15T14:00:00.000Z'));
    const rec = makeRecorder();
    const lock = createClaimLock({
      timeoutSeconds: TIMEOUT_SECONDS,
      hooks: { onReleased: (e) => rec.events.push(e) },
    });
    lock.tryClaim('conn-A');

    vi.advanceTimersByTime(29_999);
    expect(rec.events).toEqual([]);
    expect(lock.currentHolder()).toBe('conn-A');

    vi.advanceTimersByTime(2);
    // Per §5.2 row 8 + ND-01: the lock auto-releases exactly once at the
    // single fixed window from grant time. The handler turns this into a
    // claim_released broadcast.
    expect(rec.events).toEqual([{ heldBy: 'conn-A', reason: 'timeout' }]);
    expect(lock.currentHolder()).toBeUndefined();
  });

  it('duplicate claim from holder does NOT extend the timer (ND-01 no re-arming)', () => {
    vi.setSystemTime(new Date('2026-05-15T14:00:00.000Z'));
    const rec = makeRecorder();
    const lock = createClaimLock({
      timeoutSeconds: TIMEOUT_SECONDS,
      hooks: { onReleased: (e) => rec.events.push(e) },
    });
    lock.tryClaim('conn-A');

    vi.advanceTimersByTime(20_000);
    lock.tryClaim('conn-A');

    // If the timer had re-armed, we'd need another 30s. Per ND-01 the
    // grant-time window stands — 10 more seconds is enough.
    vi.advanceTimersByTime(10_001);
    expect(rec.events).toEqual([{ heldBy: 'conn-A', reason: 'timeout' }]);
  });

  it('delivered before timeout cancels the timer — no spurious timeout event', () => {
    const rec = makeRecorder();
    const lock = createClaimLock({
      timeoutSeconds: TIMEOUT_SECONDS,
      hooks: { onReleased: (e) => rec.events.push(e) },
    });
    lock.tryClaim('conn-A');
    lock.releaseAsHolder('conn-A', 'delivered');
    // Per §5.2 row 4: send→PTY clears the timer. A subsequent advance must
    // not double-fire `timeout`.
    vi.advanceTimersByTime(60_000);
    expect(rec.events).toEqual([{ heldBy: 'conn-A', reason: 'delivered' }]);
  });
});

describe('createClaimLock — releaseOnDisconnect (ws-protocol.md §5.2 row 9)', () => {
  it('disconnect of the holder fires onReleased({reason: disconnect})', () => {
    const rec = makeRecorder();
    const lock = createClaimLock({
      timeoutSeconds: TIMEOUT_SECONDS,
      hooks: { onReleased: (e) => rec.events.push(e) },
    });
    lock.tryClaim('conn-A');
    lock.releaseOnDisconnect('conn-A');
    expect(rec.events).toEqual([{ heldBy: 'conn-A', reason: 'disconnect' }]);
    expect(lock.currentHolder()).toBeUndefined();
  });

  it('disconnect of a non-holder is a silent no-op', () => {
    const rec = makeRecorder();
    const lock = createClaimLock({
      timeoutSeconds: TIMEOUT_SECONDS,
      hooks: { onReleased: (e) => rec.events.push(e) },
    });
    lock.tryClaim('conn-A');
    // Per §5.2: a non-holder disconnecting carries no claim state. The
    // lock must not invent a phantom release event.
    lock.releaseOnDisconnect('conn-B');
    expect(rec.events).toEqual([]);
    expect(lock.currentHolder()).toBe('conn-A');
  });

  it('§5.3 race 2: disconnect mid-send — handler delivers the send AND the disconnect path releases', () => {
    // The lock's contract here is just "if the holder disconnects, the
    // lock releases once." The handler ordering (write→PTY, then either
    // delivered or disconnect) is exercised in handler.test.ts. The FSM
    // guarantee: a second release attempt on an already-unclaimed lock is
    // a silent no-op — no double-fire of onReleased.
    const rec = makeRecorder();
    const lock = createClaimLock({
      timeoutSeconds: TIMEOUT_SECONDS,
      hooks: { onReleased: (e) => rec.events.push(e) },
    });
    lock.tryClaim('conn-A');
    lock.releaseAsHolder('conn-A', 'delivered');
    lock.releaseOnDisconnect('conn-A');
    expect(rec.events).toEqual([{ heldBy: 'conn-A', reason: 'delivered' }]);
  });
});

describe('createClaimLock — releaseAll (ws-protocol.md §5.2 final row)', () => {
  it('session_ended forces release regardless of holder identity', () => {
    const rec = makeRecorder();
    const lock = createClaimLock({
      timeoutSeconds: TIMEOUT_SECONDS,
      hooks: { onReleased: (e) => rec.events.push(e) },
    });
    lock.tryClaim('conn-A');
    lock.releaseAll('session_ended');
    expect(rec.events).toEqual([{ heldBy: 'conn-A', reason: 'session_ended' }]);
  });

  it('releaseAll on unclaimed lock is a no-op', () => {
    const rec = makeRecorder();
    const lock = createClaimLock({
      timeoutSeconds: TIMEOUT_SECONDS,
      hooks: { onReleased: (e) => rec.events.push(e) },
    });
    lock.releaseAll('session_ended');
    expect(rec.events).toEqual([]);
  });
});

describe('createClaimLock — §5.3 race 1: two simultaneous claims', () => {
  it('first-arrival wins under the single-threaded event loop', () => {
    // Per §5.3 race 1: "first-arrival-wins is by server event-loop
    // ordering ... must process per-session claims on a single-threaded
    // queue: the 'check Unclaimed' and 'set ClaimedBy' steps must be
    // atomic." We model that here by issuing two synchronous tryClaim()
    // calls: the first must grant, the second must busy. There is no
    // place in tryClaim where we `await` between the check and the set,
    // so this property holds for free.
    const rec = makeRecorder();
    const lock = createClaimLock({
      timeoutSeconds: TIMEOUT_SECONDS,
      hooks: { onReleased: (e) => rec.events.push(e) },
    });
    const a = lock.tryClaim('conn-A');
    const b = lock.tryClaim('conn-B');
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
    expect(lock.currentHolder()).toBe('conn-A');
  });
});

describe('createClaimLock — dispose', () => {
  it('clears a pending timer; no onReleased emitted on dispose', () => {
    const rec = makeRecorder();
    const lock = createClaimLock({
      timeoutSeconds: TIMEOUT_SECONDS,
      hooks: { onReleased: (e) => rec.events.push(e) },
    });
    lock.tryClaim('conn-A');
    lock.dispose();
    vi.advanceTimersByTime(60_000);
    // dispose is not a release — the handler that called dispose has
    // already broadcast session_ended / server_shutdown. No phantom event.
    expect(rec.events).toEqual([]);
    expect(lock.currentHolder()).toBeUndefined();
  });
});
