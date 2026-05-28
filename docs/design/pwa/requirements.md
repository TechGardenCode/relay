# Relay PWA — requirements

Functional (FR) and non-functional (NFR) requirements for the Phase 2 PWA MVP. Scope governed by
[`D-18`](../../decisions/D-18-pwa-terminal-substrate-and-mvp-scope.md).

---

## Functional requirements

- **FR-1 — Pair / auth.** Pair via a bearer token (QR or `relay://pair?...` link, per
  [`D-13`](../../decisions/D-13-first-run-pairing-ux.md)). Token lives in client storage only. WS
  auth via subprotocol-sourced bearer ([`ND-36`](../../decisions/ND-36-subprotocol-sourced-bearer-token-for-browser-ws-auth.md)).
  No persisted credentials beyond the bearer.
- **FR-2 — Sessions home.** List all sessions in two groups — **Projects** and **Scratch** — each
  row showing status (running/idle), project, short session id, and last activity.
- **FR-3 — Project navigation.** Expand a project to its sessions; attach to any.
- **FR-4 — Live terminal.** Attach to a session's PTY and render live output (xterm.js). On attach,
  paint the ring-buffer replay ([`ND-03`](../../decisions/ND-03-ring-buffer-size-for-attach-replay.md));
  reattach per [`D-G3`](../../decisions/D-G3-reattach-semantics.md); no dropped bytes in the
  connect→subscribe gap ([`ND-40`](../../decisions/ND-40-relay-attach-drops-replayed-bytes-in-connect-subscribe-gap.md)).
- **FR-5 — Control rail.** Send raw control keys without a physical keyboard: `Esc`, `Ctrl-C`,
  `Tab`, `↑`/`↓`, `Enter`, and a **plan-mode cycle** (Shift+Tab).
- **FR-6 — Compose & send.** A draft buffer: type *or* OS-dictate, edit freely, **explicit Send
  only** (`CLAIM → SEND → RELEASE`). **Never auto-sends.** Draft preserved across BUSY.
- **FR-7 — Raw input toggle.** Flip the buffer into direct per-keystroke passthrough
  ([`ND-24`](../../decisions/ND-24-per-keystroke-input-streaming-for-tui-agents.md)) for interactive
  driving (menus, single-key prompts).
- **FR-8 — Spawn against a project.** Start a new session in a registered project.
- **FR-9 — Scratch spawn.** One tap → new scratch session at `~/.relay/scratch/<id>/`, inheriting
  the user's `~/.claude/skills` automatically (G-4). Voice/type a brain-dump, send, leave.
- **FR-10 — Create project from client.** Register a server-side directory as a project without a
  local workspace (`mkdir`-or-specify path + register) — today
  [`relay project add`](../../decisions/D-12-project-record-storage-and-relay-project-add-semantics.md)
  registers an *existing* path in place.
- **FR-11 — Session controls.** Detach (leave running); release claim; kill session — from the client.
- **FR-12 — BUSY handling.** On CLAIM rejection, show the
  [`ND-02`](../../decisions/ND-02-rejection-ux-for-busy-response.md) dismissible inline indicator;
  preserve the draft; manual retry; no auto-retry.
- **FR-13 — File viewer (conditional).** Read-only file tree + light text viewer over the session's
  working dir. Separable module; deferrable to a fast-follow if its UX balloons.
- **FR-14 — Fire-and-forget.** Closing/backgrounding the PWA leaves the session running server-side
  (`prd/05-mobile-pwa.md` §3 — no client state of consequence).

---

## Non-functional requirements

- **NFR-1 — Latency.** Input→echo feels immediate over LAN/Tailscale; output streams without stalls.
  *(Concrete target to set in the tech phase, e.g. <150 ms perceived round-trip.)*
- **NFR-2 — Reliability / reconnect.** Survive phone backgrounding and network switches; auto-reconnect
  the WS and re-replay (ND-03) without losing the session; honor the ND-40 replay-gap fix.
- **NFR-3 — Statelessness.** No client state of consequence (`prd/05-mobile-pwa.md` §3); kill/reopen
  → no data loss; the server is the source of truth.
- **NFR-4 — Security.** Bearer-token auth on all REST + WS; token only in client storage; subprotocol
  WS auth (ND-36); trust model = LAN/Tailscale (G-7), no public-internet hardening assumed for MVP.
- **NFR-5 — Client-agnosticism.** No PWA-specific coupling in the server beyond the minimal additive
  touch points ([`server-touchpoints.md`](server-touchpoints.md)); the REST/WS contract stays
  canonical; PWA work must not regress the IDE extension or `relay attach`.
- **NFR-6 — Compatibility.** Modern mobile browsers; primary device = the user's phone
  *(iOS / Android — to confirm)*; design around iOS Safari PWA quirks (terminal, soft keyboard).
- **NFR-7 — Offline.** None for MVP — the PWA is a live view; disconnected = reconnect prompt.
- **NFR-8 — Ergonomics / a11y.** Thumb-sized control-rail tap targets; soft-keyboard-aware layout
  (compose + rail stay visible above the keyboard); legible terminal font on mobile.
- **NFR-9 — Disposability / migration.** A clear graduate-or-rebuild path from `spike-pwa` (decided
  in the tech phase); the spike's kill procedure stays valid until then.
- **NFR-10 — Observability.** Surface connection state + errors clearly; carry the
  [`ND-35`](../../decisions/ND-35-diagnostics-and-error-ux-deep-dive.md) / `relay doctor` error-UX
  posture to the client.
