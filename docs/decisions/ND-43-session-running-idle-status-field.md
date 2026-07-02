---
id: ND-43
status: open
title: "Session running/idle status on the sessions-list payload"
affects: "docs/arch/rest-conventions.md (sessions-list response shape); packages/server/src/server/rest/ (sessions list handler); docs/decisions/ND-13-byte-accounting-cadence-for-sessions-total-bytes.md (byte-accounting cadence — the derivation input); docs/decisions/D-18-pwa-terminal-substrate-and-mvp-scope.md §4 (no waiting-for-input heuristic); docs/arch/pwa/unresolved-dependencies.md §1.3; docs/arch/pwa/feature-modules.md §3 (FR-2 sessions home)."
surfaced-by: "[[d-18-pwa-terminal-substrate-and-mvp-scope]] §5 (committed to filing this sub-question during the PWA tech-architecture phase); harvested in docs/arch/pwa/unresolved-dependencies.md §1.3 during P2-PWA-tech (2026-07-02)."
---

# ND-43 — Session running/idle status on the sessions-list payload

**Status:** open
**Affects:** [`docs/arch/rest-conventions.md`](../arch/rest-conventions.md) (sessions-list response shape); `packages/server/src/server/rest/` (sessions list handler); [[nd-13-byte-accounting-cadence-for-sessions-total-bytes]] (byte-accounting cadence — the derivation input); [[d-18-pwa-terminal-substrate-and-mvp-scope]] §4 (no waiting-for-input heuristic); [`docs/arch/pwa/unresolved-dependencies.md`](../arch/pwa/unresolved-dependencies.md) §1.3; [`docs/arch/pwa/feature-modules.md`](../arch/pwa/feature-modules.md) §3.
**Surfaced by:** [[d-18-pwa-terminal-substrate-and-mvp-scope]] §5 (committed to filing this sub-question during the PWA tech-architecture phase); harvested in [`docs/arch/pwa/unresolved-dependencies.md`](../arch/pwa/unresolved-dependencies.md) §1.3 during P2-PWA-tech (2026-07-02).

## Question

The PWA sessions home (FR-2) shows each session as **running/idle**, derived from PTY output activity
(bytes flowing = running; quiet for N seconds = idle). Does the server expose a **computed status
field** on the session-list payload, or does the client **derive** status from fields already on the
row (`updated_at` / `total_bytes`, per the [[nd-13-byte-accounting-cadence-for-sessions-total-bytes]]
cadence)?

## Elaboration prompt

Pick the **cheapest faithful** option. Client-derived (from `updated_at` / `total_bytes`) is
zero-server-change and NFR-5-friendly, but only works if those fields are on the list payload and if the
ND-13 byte-accounting cadence is fresh enough to distinguish running from idle within a useful window —
check that cadence before committing. Server-computed is a single authoritative field but adds a derived
column/computation to the list handler that every client then trusts. Either way: define "idle" (quiet
for N seconds) and decide where N lives (server config vs. client heuristic); **avoid a
"waiting-for-input" heuristic** — unreliable over a raw PTY, explicitly ruled out by
[[d-18-pwa-terminal-substrate-and-mvp-scope]] §4. Validate against the other clients that show a running
indicator (the IDE extension's status bar reuses `GET /sessions`; see
[[nd-37-rest-poll-cadence-and-lifecycle-for-extension-live-surfaces]]) so the answer serves them
uniformly. On resolution, record the list-response field(s) in `rest-conventions.md`.

## Resolution

*(unresolved)*
