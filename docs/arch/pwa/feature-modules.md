# L4 — Feature modules (UI decomposition)

**Status:** v0.1 (in progress, 2026-07-02)
**Scope:** L4 of [`README.md`](README.md) §3 — the client-side UI module decomposition. Turns the
FRs into concrete modules, each mapped to the L2 shell surface it lives in
([`app-shell.md`](app-shell.md) §4.1 / §5.1), the L3 services it consumes
([`data-layer.md`](data-layer.md) §1.1), and the per-feature state shape L3 §1.1 deferred here.
Covers pair/auth · sessions home · live-session (terminal viewport · control rail · compose buffer ·
raw toggle · header/controls · BUSY · file panel) · spawn / scratch / create-project · file viewer ·
status & error UX · dictation.
**Out of scope:** Design-system content (L1 — [`foundations.md`](foundations.md); component
primitives are referenced abstractly here, never redefined). Framework / shell / routing (L2 —
[`app-shell.md`](app-shell.md)). Service internals — WS lifecycle, reconnect, token storage (L3 —
[`data-layer.md`](data-layer.md)). **Server-side resolution of any coupling a module surfaces** —
those are harvested to [`unresolved-dependencies.md`](unresolved-dependencies.md) and left for a
later server-side pass ([`README.md`](README.md) §2.1). Cross-cutting NFR treatment (L6 —
[`cross-cutting.md`](cross-cutting.md)).

---

## 1. How a module is specified here

Each module below is a **logical UI unit**, not an Angular `NgModule` — the PWA is
standalone-by-default and zoneless ([`app-shell.md`](app-shell.md) §2), so a "module" is a
component (or small component cluster) plus the slice of service state it drives. Modules map onto
the layer-first `src/app/` organisation (`components/`, `services/`, `guards/`) fixed in
[`app-shell.md`](app-shell.md) §6.1 — feature identity lives in the filename, not the folder.

Every module is specified along five axes:

- **Surface** — the L2 navigation model it lives in: a full route, a sheet, a direct action, or an
  inline panel ([`app-shell.md`](app-shell.md) §4.1).
- **Services** — which L3 services ([`data-layer.md`](data-layer.md) §1.1) it reads / writes, and
  the concrete signal shape L3 deferred to this layer.
- **Satisfies** — the FR(s) it delivers.
- **Primitives** — component primitives it needs, referenced **abstractly** — "a tap-target-sized
  control from the delivered scheme", never a pinned token or component name. The external L1
  delivery prescribes them; consumers use the scheme, they do not redefine it
  ([`foundations.md`](foundations.md) §5).
- **Server coupling** — anything a module needs from the server beyond the canonical REST/WS
  contract is **not resolved here**; it is filed in [`unresolved-dependencies.md`](unresolved-dependencies.md)
  and cited. This is the NFR-5 gate ([`README.md`](README.md) §2.1).

The concrete service surface every module consumes is defined once in
[`data-layer.md`](data-layer.md) §1.1: `AuthService`, `SessionsService`, `WsClientService`,
`ComposeService`, `PtyOutputService`. This layer names the per-feature signals that hang off them;
it does not re-decide the services.

## 2. Pair / auth (FR-1)

**Surface.** Full route `/pair` ([`app-shell.md`](app-shell.md) §4.1) — the first-run gate, and the
one route the `pairStatus` guard lets through unauthenticated ([`app-shell.md`](app-shell.md) §4.5).

**Flow.** The route consumes the `relay://pair?...` deep link or its QR encoding per
[[d-13-first-run-pairing-ux]]: parse the bearer out of the link / scanned payload → write it to
`AuthService.bearer` → `AuthService` persists it to `localStorage` ([`data-layer.md`](data-layer.md)
§2) → flip `pairStatus` to `paired` → navigate to `/`. The token rides **in** the pairing artifact
(D-13), so there is no separate credential exchange to build.

**Services.** Writes `AuthService.bearer: WritableSignal<string | null>` and derives
`pairStatus: Signal<'unpaired' | 'pairing' | 'paired'>`. No other service is touched until the first
authenticated navigation.

**Primitives.** A scan affordance (camera / paste-link fallback) and a status line, both from the
delivered scheme.

**Server coupling.** None beyond the existing surface. The bearer authenticates all subsequent REST
(header) and WS (subprotocol, [[nd-36-subprotocol-sourced-bearer-token-for-browser-ws-auth]]) — both
already canonical. First authenticated call (`GET /`'s data, §3) is what proves the token; a `401`
clears it back to `unpaired` ([`data-layer.md`](data-layer.md) §2).

**Cites.** FR-1; [[d-13-first-run-pairing-ux]]; NFR-4 (bearer only, client storage only);
[[nd-36-subprotocol-sourced-bearer-token-for-browser-ws-auth]]; [`data-layer.md`](data-layer.md) §2
(token storage), §1.1 (`AuthService`); [`app-shell.md`](app-shell.md) §4.5 (guard).

## 3. Sessions home (FR-2, FR-3)

**Surface.** Full route `/` ([`app-shell.md`](app-shell.md) §4.1) — the default landing after auth,
eager-loaded ([`app-shell.md`](app-shell.md) §4.4).

**Composition.** Two top-level groups per [`interaction-model.md`](../../design/pwa/interaction-model.md)
§1 — **Projects** (each expandable to its sessions, FR-3) and **Scratch**. The grouping is a
**client-side IA concern**: the module partitions the flat `GET /sessions` list into the two buckets;
"Scratch" is not a server construct the client depends on (its server-side shape is an open coupling —
see §10 / [L5 §1.1](unresolved-dependencies.md)). Each row shows status (running/idle), project, short
session id, and last activity (FR-2). Tapping a row navigates to `/sessions/:id` (FR-3).

**Services.** Reads `SessionsService`:

- `sessions: Signal<SessionRow[]>` — server-derived list, populated from `GET /sessions`
  (cursor-paginated per [`rest-conventions.md`](../rest-conventions.md) §5 if it ever grows; the MVP
  list fits one response).
- `groups: Computed<{ projects: ProjectGroup[]; scratch: SessionRow[] }>` — client-derived
  partition (IA only).
- Per-row `status: 'running' | 'idle'` — **its derivation is an unresolved server coupling**
  ([L5 §1.3](unresolved-dependencies.md)); the module renders whatever `SessionsService` exposes and
  does not itself decide server-computed-vs-client-derived.

**Refresh.** The home is not attached to any session socket, so the list refreshes by polling
`GET /sessions` on a client-side cadence — the same posture the extension's live surfaces settled in
[[nd-37-rest-poll-cadence-and-lifecycle-for-extension-live-surfaces]]; the concrete interval is a
client tuning knob (L6 latency/observability), not a protocol change.

**Primitives.** Grouped/expandable list rows and a status indicator, from the delivered scheme;
tap-target sizing per NFR-8.

**Server coupling.** Running/idle **status field** → [L5 §1.3](unresolved-dependencies.md).
"Scratch" grouping semantics → [L5 §1.1](unresolved-dependencies.md). Neither resolved here.

**Cites.** FR-2, FR-3; [`interaction-model.md`](../../design/pwa/interaction-model.md) §1, §5;
[`data-layer.md`](data-layer.md) §1.1 (`SessionsService`);
[`rest-conventions.md`](../rest-conventions.md) §5 (list shape);
[[nd-37-rest-poll-cadence-and-lifecycle-for-extension-live-surfaces]] (poll posture);
[[nd-13-byte-accounting-cadence-for-sessions-total-bytes]] (a status-derivation input).

## 4. Live-session (FR-4…7, FR-11, FR-12)

**Surface.** Full route `/sessions/:id` ([`app-shell.md`](app-shell.md) §4.1) — durable,
deep-linkable, refresh-survivable (FR-14). The centerpiece view; its shell composition (header ·
primary area · control rail · compose) and soft-keyboard handling are already fixed in
[`app-shell.md`](app-shell.md) §5.1 / §5.2. **This section decomposes _within_ that shell** — it does
not re-decide layout.

**Attach lifecycle.** On route activation the view drives `WsClientService.attach(sessionId)`, which
opens the socket (subprotocol bearer, [[nd-36-subprotocol-sourced-bearer-token-for-browser-ws-auth]]),
receives `hello` → bracketed ring-buffer replay ([[nd-03-ring-buffer-size-for-attach-replay]]) → live
bytes, and feeds binary frames to `PtyOutputService`. The connect→subscribe replay-gap buffer
([[nd-40-relay-attach-drops-replayed-bytes-in-connect-subscribe-gap]]) is owned by `WsClientService`
([`data-layer.md`](data-layer.md) §3.3); the viewport is a pure consumer. Reattach shows what
[[d-g3-reattach-semantics]] specifies. All lifecycle mechanics live in L3; L4 only wires the sub-modules
to the service signals.

### 4.1 Terminal viewport (FR-4)

An `xterm.js` instance ([[d-18-pwa-terminal-substrate-and-mvp-scope]]). Consumes
`PtyOutputService.bytes(sessionId)` and writes each chunk to the terminal verbatim (opaque bytes —
[`ws-protocol.md`](../ws-protocol.md) §2.4). The `replay_start`/`replay_end` bracket
([`ws-protocol.md`](../ws-protocol.md) §3) is the module's one UX hook: the boundary between replayed
scrollback and the live stream is where a reattaching client may paint a subtle "resumed" marker
([[d-g3-reattach-semantics]]) — a client-owned choice, not a protocol obligation. `fit-addon` re-fits
on container resize and emits a WS `resize` frame per [[nd-23-pty-size-negotiation-and-sigwinch-forwarding-for-attach-clients]];
that wire is already run to the keyboard handler in [`app-shell.md`](app-shell.md) §5.2, so the
viewport just hosts the addon.

**State.** Component-local `Terminal` + `FitAddon` handles (not service state — they are imperative
DOM objects). Reads `PtyOutputService`; single consumer per session ([`data-layer.md`](data-layer.md)
§3.3).

**Primitives.** The monospace terminal font + the terminal colour palette come from the delivered
scheme ([`foundations.md`](foundations.md) §4, NFR-8) — the viewport does not hard-code either.

**Cites.** FR-4; [[d-18-pwa-terminal-substrate-and-mvp-scope]] (xterm.js);
[[nd-03-ring-buffer-size-for-attach-replay]]; [[nd-40-relay-attach-drops-replayed-bytes-in-connect-subscribe-gap]];
[[d-g3-reattach-semantics]]; [[nd-23-pty-size-negotiation-and-sigwinch-forwarding-for-attach-clients]];
[`ws-protocol.md`](../ws-protocol.md) §2.4, §3.

### 4.2 Control rail (FR-5)

Keyless control affordances — `Esc · ^C · Tab · ↑ ↓ · Enter · ⌥ (plan-mode cycle = Shift+Tab)`
([`interaction-model.md`](../../design/pwa/interaction-model.md) §2). Each button maps to a fixed raw
control byte sequence, base64-encodes it, and sends it through the claim path as a WS `send`
([`ws-protocol.md`](../ws-protocol.md) §2.2). The rail sits in normal flow (not `position: fixed`) so
the keyboard-inset handling applies uniformly ([`app-shell.md`](app-shell.md) §5.1).

**The claim/release subtlety is a server coupling, not resolved here.** The server releases the claim
only on a newline byte ([[nd-24-per-keystroke-input-streaming-for-tui-agents]]); a bare control byte
(`^C`, arrows, Shift+Tab) is not a newline, so without handling it holds the claim until the
[[nd-01-claim-lock-timeout-duration]] timeout. `Enter` is the sole rail key that self-releases (it
sends `\r`). Everything else needs a send-then-release rule — filed at
[L5 §1.2](unresolved-dependencies.md). The rail's client behaviour (explicit `release` after each
non-newline control send, vs. relying on a server-side single-control-send rule) is pinned once that
ND resolves; until then the module treats "how the claim is freed after a control byte" as an external
dependency.

**State.** Reads `WsClientService.claimState` to enable/disable and to reflect held-claim UI. Writes
via `WsClientService.send(bytes)`.

**Primitives.** Thumb-sized tap targets from the delivered scheme (NFR-8).

**Cites.** FR-5; [`interaction-model.md`](../../design/pwa/interaction-model.md) §2;
[[nd-24-per-keystroke-input-streaming-for-tui-agents]]; [[nd-01-claim-lock-timeout-duration]];
[`ws-protocol.md`](../ws-protocol.md) §2.2; **coupling →** [L5 §1.2](unresolved-dependencies.md).

### 4.3 Compose buffer (FR-6)

The **default** input: a draft text area + Send. Backed by `ComposeService.draft(sessionId):
WritableSignal<string>`, one draft per session, preserved across BUSY (FR-12 — see §4.6). Send is
**explicit only; never auto-sends** (FR-6): it runs one `CLAIM → SEND → RELEASE` — `claim` →
`claim_ack` → a single `send` carrying the draft with a trailing newline, which the server writes and
then auto-releases on the newline byte ([[nd-24-per-keystroke-input-streaming-for-tui-agents]];
[`ws-protocol.md`](../ws-protocol.md) §5.1 IDE-compose path `Idle → Claiming → Streaming → Idle` — the
§5.1 FSM table's collapsed form per ND-24; the §5.1 prose's separate `Claimed`/`Sending` states are the
same path). An explicit `release` frame is the fallback only if a draft ever carries no trailing newline. On `busy`,
the draft is retained and the §4.6 indicator shows.

**Dictation** feeds this buffer — see §8; it is a native input path into `ComposeService.draft`, not a
separate send path.

**State.** `ComposeService.draft(sessionId)`; reads `WsClientService.claimState` / connection state to
gate Send.

**Primitives.** A multiline input, a mic affordance (OS dictation trigger — §8), and a Send button,
all from the delivered scheme.

**Cites.** FR-6; [`interaction-model.md`](../../design/pwa/interaction-model.md) §2;
[[nd-24-per-keystroke-input-streaming-for-tui-agents]]; [`ws-protocol.md`](../ws-protocol.md) §5.1;
[`data-layer.md`](data-layer.md) §1.1 (`ComposeService`).

### 4.4 Raw input toggle (FR-7)

Flips the compose buffer out of edit-before-send line mode into **direct per-keystroke passthrough**
for interactive driving (menus, single-key prompts). In raw mode each keystroke is a `send`
([`ws-protocol.md`](../ws-protocol.md) §5.1 raw-mode `Streaming` path,
[[nd-24-per-keystroke-input-streaming-for-tui-agents]]); the server holds the claim while bytes flow
and releases on the first newline. This is the same wire the `relay attach` thin client uses — the PWA
is simply another §5.1 client surface, no new wire.

**State.** A `rawMode: WritableSignal<boolean>` on `WsClientService` (it already models the
claim/streaming state the toggle switches between). While raw, both typed keys and control-rail keys
(§4.2) stream per-keystroke.

**Primitives.** A mode toggle from the delivered scheme; a clear raw-mode affordance so the user knows
keystrokes are live (NFR-8, NFR-10).

**Cites.** FR-7; [[nd-24-per-keystroke-input-streaming-for-tui-agents]];
[`ws-protocol.md`](../ws-protocol.md) §5.1.

### 4.5 File panel (FR-13, inline)

The primary area hosts the terminal viewport **and** a peer file panel, arranged per the
viewport-adaptive decision in [`app-shell.md`](app-shell.md) §4.3 (desktop split-pane; mobile soft
toggle between peer panels). The panel's own decomposition — and the server surface it needs — is the
file-viewer module in §6; it is called out here only as a composed sub-module of the live-session
shell.

**Cites.** FR-13; [`app-shell.md`](app-shell.md) §4.3; module detail in §6.

### 4.6 Header + session controls (FR-11, FR-2)

**Header.** Session id + status (FR-2, FR-11) — reads `SessionsService` for the row and
`WsClientService` for live connection/claim state.

**Controls.** Three actions, all on the **existing** contract:

- **Detach — leave running.** Close the WebSocket and navigate away; the server session keeps running
  (FR-14 fire-and-forget; [[d-g3-reattach-semantics]] guarantees a clean reattach later). No REST call.
- **Release claim.** Send a WS `release` frame ([`ws-protocol.md`](../ws-protocol.md) §2.2) — a
  best-effort voluntary release so a queued device can take over without waiting out the timeout.
- **Kill session.** `DELETE /sessions/:id` ([`rest-conventions.md`](../rest-conventions.md) §3 → `204`,
  idempotent); the server emits `session_ended` on the socket ([`ws-protocol.md`](../ws-protocol.md)
  §2.3) and the view returns to home.

**State.** Reads `SessionsService` + `WsClientService`; writes via `WsClientService.release()` and a
`SessionsService.kill(id)` REST call.

**Server coupling.** None — kill/detach/release are all canonical.

**Cites.** FR-11, FR-2, FR-14; [[d-g3-reattach-semantics]]; [`ws-protocol.md`](../ws-protocol.md) §2.2,
§2.3; [`rest-conventions.md`](../rest-conventions.md) §3.

### 4.7 BUSY handling (FR-12)

On a `busy` frame ([`ws-protocol.md`](../ws-protocol.md) §2.3 — another connection holds the claim),
show the [[nd-02-rejection-ux-for-busy-response]] **dismissible inline indicator**, **preserve the
draft** (`ComposeService`, §4.3), and offer **manual retry only — no auto-retry** (ND-02 is explicit;
retry is a deliberate user action). Maps to the `Backoff` state of the §5.1 client FSM. This is the
claim-contention slice of the broader status & error surface (§7).

**State.** Reads `WsClientService.claimState` / `lastError`; retains `ComposeService.draft`.

**Primitives.** A dismissible inline notice from the delivered scheme.

**Cites.** FR-12; [[nd-02-rejection-ux-for-busy-response]]; [`ws-protocol.md`](../ws-protocol.md) §2.3,
§5.1; consolidated with §7.

## 5. Spawn / scratch / create-project (FR-8, FR-9, FR-10)

Three entry points into a new session, each on the L2 navigation model already chosen in
[`app-shell.md`](app-shell.md) §4.1:

- **Spawn against a project (FR-8)** — a **sheet** over home: pick project → confirm → `POST /sessions
  { projectId }` (existing route, [`rest-conventions.md`](../rest-conventions.md) §3 → `201` +
  `Location`) → navigate to `/sessions/:id`. No new coupling.
- **Scratch spawn (FR-9)** — a **direct action** (no UI surface): one tap → the server creates
  `~/.relay/scratch/<id>/`, registers it as a lightweight project (so `project_id NOT NULL` holds — no
  schema change), spawns `claude`, and returns the session; the client navigates to `/sessions/:id`.
  The user's `~/.claude/skills` apply automatically (G-4) — no client wiring. **The create-by-path
  step is a server coupling** ([L5 §1.1](unresolved-dependencies.md)); the client only fires the action
  and follows the returned id.
- **Create-project from client (FR-10)** — a **sheet** over home: a path field (specify an existing
  server-side dir, or request a `mkdir`) → register → return to an updated home. Same create-by-path
  coupling as scratch ([L5 §1.1](unresolved-dependencies.md), which cites FR-9 **and** FR-10); today
  [[d-12-project-record-storage-and-relay-project-add-semantics]] registers an *existing* path in place,
  so client-driven `mkdir`-or-specify is the additive part.

**Services.** Reads `AuthService` (bearer); writes through `SessionsService` (create + refresh the
list). Scratch/create-project share one `SessionsService.createByPath(...)` seam whose server shape is
pending the L5 §1.1 resolution.

**Primitives.** A picker sheet and a single-field form from the delivered scheme.

**Server coupling.** Scratch + create-project both need **create-by-path** →
[L5 §1.1](unresolved-dependencies.md). Spawn-against-project needs nothing new.

**Cites.** FR-8, FR-9, FR-10; [`interaction-model.md`](../../design/pwa/interaction-model.md) §3;
[`app-shell.md`](app-shell.md) §4.1; [[d-12-project-record-storage-and-relay-project-add-semantics]];
[`rest-conventions.md`](../rest-conventions.md) §3; **coupling →** [L5 §1.1](unresolved-dependencies.md).

## 6. File viewer (FR-13)

A read-only **file tree** + **light text viewer** (view, not edit) over the session's working dir
([`interaction-model.md`](../../design/pwa/interaction-model.md) §4). No diff-approval screen (approve
in the TUI), no editing (remote VS Code covers that) — the descope is fixed by
[[d-18-pwa-terminal-substrate-and-mvp-scope]] §4. Built as an **isolated module** so it can drop to a
fast-follow without touching the terminal core (FR-13 is explicitly conditional/separable). It composes
into the live-session shell as the §4.5 file panel (viewport-adaptive per
[`app-shell.md`](app-shell.md) §4.3).

**Server coupling — new, surfaced by this layer.** The PWA is a browser client with **no filesystem
access to the server host**, and the canonical REST surface today
([`rest-conventions.md`](../rest-conventions.md); the routes are projects + sessions + transcript) has
**no directory-listing or file-read endpoint**. FR-13 therefore needs an **additive** server surface:
list the working-dir tree, and read a single file's contents, both scoped to a session's working dir.
This is a genuine new coupling — filed at [L5 §2.1](unresolved-dependencies.md), not resolved here
(NFR-5). Because the module is separable, the whole feature can defer to a fast-follow if that ND is not
picked up in the first server pass.

**State.** A module-local `tree: Signal<FileNode[]>` and `openFile: Signal<{ path; text } | null>`,
both populated from the (pending) file surface via a thin `FilesService` — deliberately **not** one of
the L3 §1.1 core services, since the feature is separable and may ship late.

**Primitives.** A tree/list component and a monospace read-only text view from the delivered scheme.

**Cites.** FR-13; [`interaction-model.md`](../../design/pwa/interaction-model.md) §4;
[[d-18-pwa-terminal-substrate-and-mvp-scope]] §4; [`app-shell.md`](app-shell.md) §4.3;
[`rest-conventions.md`](../rest-conventions.md) (no file surface today); **coupling →**
[L5 §2.1](unresolved-dependencies.md).

## 7. Status & error UX (FR-12, NFR-10)

The client's single, consistent surface for "what is the connection doing, and what went wrong." It
**consolidates** treatments already decided elsewhere rather than re-deciding them:

- **Connection state** — `WsClientService` exposes `idle / connecting / attached / reconnecting /
  error` ([`data-layer.md`](data-layer.md) §1.1). The reconnect UX copy ("reconnecting (attempt N)" in
  window; "disconnected — tap to reconnect" after the 10-minute window) is already fixed in
  [`data-layer.md`](data-layer.md) §3.2 — this module **renders** it; L6 owns the reliability posture.
- **BUSY** (FR-12) — the claim-contention case (§4.7, [[nd-02-rejection-ux-for-busy-response]]).
- **REST errors** — RFC 9457 problem-details ([`rest-conventions.md`](../rest-conventions.md) §2);
  render `detail` plus the recovery copy keyed on the `type` slug from the §7 recovery table
  ([[nd-35-diagnostics-and-error-ux-deep-dive]]). A `401` routes through `AuthService` back to `/pair`.
- **WS `error` frames** — [`ws-protocol.md`](../ws-protocol.md) §4.1: non-fatal (`fatal: false`)
  surfaces inline and the connection continues; fatal drives the close/reconnect path.

The posture is the [[nd-35-diagnostics-and-error-ux-deep-dive]] / `relay doctor` error-UX bar carried to
the client (NFR-10): a clear cause and a next action, never a raw stack. No new server coupling — every
input here is already on the canonical contract. L6 §observability carries the cross-cutting NFR-10 view;
this section is the module that draws it.

**State.** Reads `WsClientService.{connectionState, lastError}` and `AuthService`; no writes beyond
dismiss/retry affordances.

**Cites.** FR-12, NFR-10; [`data-layer.md`](data-layer.md) §1.1, §3.2;
[[nd-02-rejection-ux-for-busy-response]]; [[nd-35-diagnostics-and-error-ux-deep-dive]];
[`rest-conventions.md`](../rest-conventions.md) §2, §7; [`ws-protocol.md`](../ws-protocol.md) §4.1;
cross-ref [`cross-cutting.md`](cross-cutting.md) (NFR-10).

## 8. Dictation (FR-6)

Voice input is the phone's **built-in keyboard dictation** writing into the compose draft (§4.3) — no
custom in-app mic or transcription engine (deferred by [[d-18-pwa-terminal-substrate-and-mvp-scope]] §4;
OS dictation covers the MVP experience). It **never auto-sends** (FR-6): dictation is lossy, so the user
reviews/edits the draft and taps Send, which runs the one `CLAIM → SEND → RELEASE` (§4.3). Architecturally
dictation is a **zero-coupling native input path** — it is the OS keyboard writing text into a normal
input; the PWA neither captures audio nor talks to any speech service, so there is no server surface and
no client audio module. The mic affordance in the compose primitive (§4.3) is just the OS dictation
trigger.

**Server coupling.** None (OS feature).

**Cites.** FR-6; [`interaction-model.md`](../../design/pwa/interaction-model.md) §2;
[[d-18-pwa-terminal-substrate-and-mvp-scope]] §4 (custom voice descoped); consolidated with §4.3.

## 9. Module ↔ surface ↔ service ↔ coupling matrix

| Module | Surface (L2 §4.1) | Primary services (L3 §1.1) | Satisfies | Server coupling |
| --- | --- | --- | --- | --- |
| Pair / auth | route `/pair` | `AuthService` | FR-1 | none (D-13, ND-36 canonical) |
| Sessions home | route `/` | `SessionsService` | FR-2, FR-3 | status field → [L5 §1.3](unresolved-dependencies.md); Scratch grouping → [L5 §1.1](unresolved-dependencies.md) |
| Terminal viewport | in `/sessions/:id` | `PtyOutputService`, `WsClientService` | FR-4 | none (replay/reattach/resize canonical) |
| Control rail | in `/sessions/:id` | `WsClientService` | FR-5 | control-key claim/release → [L5 §1.2](unresolved-dependencies.md) |
| Compose buffer | in `/sessions/:id` | `ComposeService`, `WsClientService` | FR-6 | none |
| Raw input toggle | in `/sessions/:id` | `WsClientService` | FR-7 | none (ND-24 wire) |
| Header + controls | in `/sessions/:id` | `SessionsService`, `WsClientService` | FR-11, FR-2, FR-14 | none (kill/detach/release canonical) |
| BUSY handling | in `/sessions/:id` | `WsClientService`, `ComposeService` | FR-12 | none (ND-02) |
| Spawn / scratch / create-project | sheet + direct action over `/` | `SessionsService`, `AuthService` | FR-8, FR-9, FR-10 | create-by-path → [L5 §1.1](unresolved-dependencies.md) |
| File viewer | inline panel in `/sessions/:id` | `FilesService` (separable) | FR-13 | **file surface → [L5 §2.1](unresolved-dependencies.md)** |
| Status & error UX | cross-view | `WsClientService`, `AuthService` | FR-12, NFR-10 | none |
| Dictation | in compose (`/sessions/:id`) | `ComposeService` | FR-6 | none (OS feature) |

## 10. Server couplings this layer touches

Four couplings, none resolved here (NFR-5 — [`README.md`](README.md) §2.1). Three are the seed entries
D-18 §5 committed to filing during this tech phase; the fourth is new to this layer:

1. **Scratch / create-by-path** (§3, §5) — [L5 §1.1](unresolved-dependencies.md), filed
   [[nd-41-scratch-create-by-path-project-registration]].
2. **Control-key claim/release semantics** (§4.2) — [L5 §1.2](unresolved-dependencies.md), filed
   [[nd-42-control-key-claim-release-semantics]].
3. **Session running/idle status field** (§3) — [L5 §1.3](unresolved-dependencies.md), filed
   [[nd-43-session-running-idle-status-field]].
4. **File-viewer server surface** (§6) — **new**, [L5 §2.1](unresolved-dependencies.md), filed
   [[nd-44-file-viewer-server-surface]].

## 11. Loose ends

- **File-viewer separability.** Because FR-13's server surface is an unresolved coupling, the whole
  module is the natural first fast-follow if [L5 §2.1](unresolved-dependencies.md) is not picked up in
  the first server pass. Nothing else in L4 depends on it.
- **Component-primitive references stay abstract** until the L1 design-system delivery
  ([`foundations.md`](foundations.md) §6). Every "from the delivered scheme" above is a deliberate
  non-pin; revisit on delivery to bind concrete primitives.
- **`FilesService` placement** (§6) is intentionally outside the L3 §1.1 core-service set while the
  feature is separable; fold it into the core surface only if FR-13 graduates from conditional to
  always-on.
- **Control-rail client behaviour** (§4.2) is pinned once [L5 §1.2](unresolved-dependencies.md)
  resolves send-then-release vs. a server-side rule — until then the rail codes to "claim freed
  externally after a control byte".
