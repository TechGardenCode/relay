# Relay Arch — PWA UI Client — Unresolved Server Dependencies

**Status:** v0.1 (running log, 2026-06-02)
**Scope:** Server-side couplings the PWA UI-client architecture needs but cannot resolve here (this
doc set is client-only — see [`README.md`](README.md) §2.1). Each entry is a **candidate ND** for a
later server-side pass. Seed entries are carried over from
[`../../design/pwa/server-touchpoints.md`](../../design/pwa/server-touchpoints.md); the session
appends more as couplings surface during L1–L6 work.

**Out of scope:** Resolving the server-side mechanism. That happens in a separate phase that opens
an ND (via the `decision-log` skill) and lands the change in `docs/arch/{rest-conventions,
ws-protocol, sqlite-schema}.md` as appropriate.

---

## 1. Seed dependencies (from `server-touchpoints.md`)

### 1.1 Scratch create-by-path

**Need.** The PWA's scratch spawn (FR-9) creates a server-side dir under `~/.relay/scratch/<id>/`
and registers it as a lightweight project (so `sessions.project_id NOT NULL` holds — no schema
change). The grouping as "Scratch" vs first-class project is a client/IA concern.

**Open for the server pass.** Cleanup trigger for the scratch dir; whether "Scratch" is a reserved
project flag, a path-prefix convention, or a client-only view.

**Cites.** FR-9, FR-10; [[d-12-project-record-storage-and-relay-project-add-semantics]];
[`server-touchpoints.md`](../../design/pwa/server-touchpoints.md) §1.

### 1.2 Control-key claim / release semantics

**Need.** The control rail (FR-5) sends raw control bytes (`Ctrl-C`, `Esc`, arrows, plan-mode
cycle). Per [[nd-24-per-keystroke-input-streaming-for-tui-agents]] the server releases the claim on
newline — a bare control byte is not a newline, so without handling the claim is held until the
[[nd-01-claim-lock-timeout-duration]] inactivity timeout. The rail must send-then-release, or the
server must treat a single non-newline control send as fire-and-release.

**Open for the server pass.** Client-driven explicit RELEASE per control-key send vs server-side
rule; file as ND.

**Cites.** FR-5; [[nd-24-per-keystroke-input-streaming-for-tui-agents]];
[[nd-01-claim-lock-timeout-duration]]; [`server-touchpoints.md`](../../design/pwa/server-touchpoints.md) §2.

### 1.3 Session running / idle status field

**Need.** The sessions home (FR-2) shows running/idle, derived from PTY output activity. Needs a
status signal on the session-list payload (or a derivation the client can compute from existing
fields, e.g. `updated_at` / `total_bytes`).

**Open for the server pass.** Server-computed status field vs client-derived from existing fields
([[nd-13-byte-accounting-cadence-for-sessions-total-bytes]] cadence). Avoid a "waiting-for-input"
heuristic per [[d-18-pwa-terminal-substrate-and-mvp-scope]] §4.

**Cites.** FR-2; [`interaction-model.md`](../../design/pwa/interaction-model.md) §5;
[[nd-13-byte-accounting-cadence-for-sessions-total-bytes]];
[`server-touchpoints.md`](../../design/pwa/server-touchpoints.md) §3.

---

## 2. Surfaced during the architecture session

*(entries appended as new couplings surface during L1–L6 work; each captures the need, what's open
for the server pass, and citations to the requirement / decision that surfaced it)*
