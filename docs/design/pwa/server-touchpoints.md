# Relay PWA — server / protocol touch points

The PWA is designed to reuse the existing server surface. This doc names the few **additive** touch
points it needs, kept minimal to preserve client-agnosticism (NFR-5). Each additive item is a
**candidate ND** — its concrete protocol/REST/schema shape is resolved during the PWA
tech-architecture phase ([`D-18`](../../decisions/D-18-pwa-terminal-substrate-and-mvp-scope.md) §5),
not here. This doc states *what* is needed and *why*; [`docs/arch/`](../../arch/) remains the home
for the wire shape.

---

## Reuse (no change needed)

- **REST** projects + sessions routes, error envelope, pagination — [`arch/rest-conventions.md`](../../arch/rest-conventions.md).
- **WS frames** for attach / output / claim / send / release / busy / replay — [`arch/ws-protocol.md`](../../arch/ws-protocol.md).
- **Replay + reattach** — [`ND-03`](../../decisions/ND-03-ring-buffer-size-for-attach-replay.md),
  [`D-G3`](../../decisions/D-G3-reattach-semantics.md),
  [`ND-40`](../../decisions/ND-40-relay-attach-drops-replayed-bytes-in-connect-subscribe-gap.md).
- **BUSY UX** — [`ND-02`](../../decisions/ND-02-rejection-ux-for-busy-response.md).
- **Browser-client serving + auth** — the Track 9 spike's `/app/*` static-serve and
  [`ND-36`](../../decisions/ND-36-subprotocol-sourced-bearer-token-for-browser-ws-auth.md)
  subprotocol-sourced bearer (already in tree under `packages/server/src/server/static/` + the auth
  preHandler edit).

## Additive (candidate NDs for the tech phase)

### 1. Scratch create-by-path
`mkdir` a working dir under `~/.relay/scratch/<id>/` and register it as a lightweight project so the
scratch session has a `project_id` (the `sessions.project_id NOT NULL` constraint stands — no schema
change). The grouping as "Scratch" vs. a first-class project is a client/IA concern; the server just
needs a create-project path that accepts a server-side dir (FR-9, FR-10). Relates to
[`D-12`](../../decisions/D-12-project-record-storage-and-relay-project-add-semantics.md) (which today
registers an *existing* path in place).

**Open for the tech phase:** does the scratch dir get auto-cleaned, and on what trigger? Is the
"Scratch" grouping a reserved project flag, a path-prefix convention, or a client-only view?

### 2. Control-key claim / release semantics
The control rail sends raw control bytes (`Ctrl-C`, `Esc`, arrows, plan-mode cycle). Input releases
the claim on a *newline* ([`ND-24`](../../decisions/ND-24-per-keystroke-input-streaming-for-tui-agents.md));
a bare control key is not a newline, so without handling it would hold the claim until the
[`ND-01`](../../decisions/ND-01-claim-lock-timeout-duration.md) inactivity timeout. The rail must
**send-then-explicitly-release** (or the server must treat a single control-char send as
fire-and-release).

**Open for the tech phase:** client-driven explicit RELEASE after each control-key send, vs. a
server-side rule for single non-newline control sends. Decide and file the ND.

### 3. Session running/idle status field
The sessions list (FR-2) shows running/idle, derived from PTY output activity (bytes flowing =
running; quiet for N seconds = idle). Needs a status signal on the session list payload (or a
derivation the client can compute from existing fields).

**Open for the tech phase:** server-computed status field on the list response vs. client-derived
from `updated_at` / `total_bytes` cadence ([`ND-13`](../../decisions/ND-13-byte-accounting-cadence-for-sessions-total-bytes.md)).
Pick the cheapest faithful option; avoid a "waiting-for-input" heuristic (D-18 §4).
