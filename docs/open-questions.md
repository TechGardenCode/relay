# Relay — Open Questions & Decisions

**Status:** v0.4 (living)
**Scope:** Every unresolved product decision affecting the Relay PRD or its execution. This document is a first-class peer of `prd.md`, not a subdoc. It is expected to grow as new gaps surface during PRD iteration and implementation.

This is **not a parking lot** of stale ideas. It is the authoritative record of what's still being decided. Subdocs in `prd/` reference entries here by ID rather than re-litigating decisions in multiple places. When a decision is resolved, the corresponding spec content moves into the relevant subdoc and the entry here updates to `Status: resolved`.

---

## Decision template

Each entry uses this template so they're scannable and easy to update:

```
## D-NN: <short title>

**Status:** open | in-deliberation | resolved (resolution date) | deferred (until <trigger>)
**Affects:** <which subdoc(s) and section(s) this decision unblocks>
**Surfaced by:** <where this came from — original PRD §15, deep-dive analysis G-NN, ad hoc, etc.>

### Question
<the precise decision to be made, in one sentence>

### Context
<why this matters, what depends on it, what's at stake if it's wrong>

### Options under consideration
- **Option A** — <description, trade-offs>
- **Option B** — <description, trade-offs>

### Current thinking
<provisional lean if any, or "no preference yet">

### Resolution
<filled in when status flips to resolved; captures chosen option and rationale>
```

---

## Propagation protocol for resolved entries

When a decision flips to `resolved`, its spec content has to land in the affected subdoc. This is the checked-in convention so propagation is reproducible and traceable both ways.

**Step 1 — Locate the target section.** The `Affects:` field on the entry names the subdoc(s) and section(s). That field is the work order.

**Step 2 — Replace or fill the placeholder.** Inside the target subdoc section, either replace prior placeholder text (e.g., "either client can send input") with normative spec prose, or add the section if it doesn't exist yet. The spec content is **prose describing the contract**, not a copy of the open-questions Resolution section. The Resolution section is the deliberation record; the subdoc is the spec.

**Step 3 — Add a back-reference.** At the end of the updated subdoc section, append: `*Resolved by [D-NN](../open-questions.md#d-nn-<slug>) on <YYYY-MM-DD>.*` so a reader of the spec can trace back to the deliberation if they want the why.

**Step 4 — Annotate the open-questions Resolution.** Append a `Propagated to:` line under the entry's Resolution naming each subdoc section that now carries the spec content. Example: `Propagated to: prd/03-server.md §5.1 (2026-05-14).` This makes propagation idempotent — anyone scanning open-questions.md can tell at a glance whether the resolution has landed.

**Step 5 — Update the Index.** Move the entry between sections (open / deferred / resolved) and append the date.

**Tooling cue:** A future helper script could read this file, list every `resolved` entry without a `Propagated to:` line, and surface them as a work queue. Not needed now, but the protocol is shaped to enable it.

---

## Index

**Open / in-deliberation:**
- [ND-08 — Skill subset enforcement mechanism](#nd-08-skill-subset-enforcement-mechanism)
- [ND-10 — `relay token list` subcommand surface alignment](#nd-10-relay-token-list-subcommand-surface-alignment)
- [ND-12 — `spawn.json` schema location](#nd-12-spawnjson-schema-location)
- [ND-13 — Byte-accounting cadence for `sessions.total_bytes`](#nd-13-byte-accounting-cadence-for-sessionstotal_bytes)

**Deferred:**
- [D-02 — PWA initial server discovery](#d-02-pwa-initial-server-discovery) (deferred until Phase 2)
- [D-05 — Per-device token rotation](#d-05-per-device-token-rotation) (deferred until Phase 3)
- [D-14 — Product name](#d-14-product-name) (deferred until pre-launch naming review)

**Resolved:**
- [D-G1 — Persona application semantics](#d-g1-persona-application-semantics) (resolved 2026-05-14)
- [D-G2 — Multi-client input arbitration](#d-g2-multi-client-input-arbitration) (resolved 2026-05-14)
- [D-G3 — Reattach semantics](#d-g3-reattach-semantics) (resolved 2026-05-14)
- [D-G6 — Project discovery / workspace-to-project binding](#d-g6-project-discovery--workspace-to-project-binding) (resolved 2026-05-14)
- [D-01 — Workspace root vs. subdirectory for start-session](#d-01-workspace-root-vs-subdirectory-for-start-session) (resolved 2026-05-14)
- [D-03 — MCP set changes mid-session](#d-03-mcp-set-changes-mid-session) (resolved 2026-05-14)
- [D-04 — Transcript export endpoint](#d-04-transcript-export-endpoint) (resolved 2026-05-14)
- [D-06 — Persona inheritance](#d-06-persona-inheritance) (resolved 2026-05-14)
- [D-07 — Transcript stream capture layer](#d-07-transcript-stream-capture-layer) (resolved 2026-05-14)
- [D-08 — Single binary vs. separate packages](#d-08-single-binary-vs-separate-packages) (resolved 2026-05-14)
- [D-09 — Persona YAML schema](#d-09-persona-yaml-schema) (resolved 2026-05-15)
- [D-10 — Agent model credentials handling](#d-10-agent-model-credentials-handling) (resolved 2026-05-15)
- [D-11 — Server restart and session orphaning](#d-11-server-restart-and-session-orphaning) (resolved 2026-05-15)
- [D-12 — Project record storage and `relay project add` semantics](#d-12-project-record-storage-and-relay-project-add-semantics) (resolved 2026-05-15)
- [D-13 — First-run pairing UX](#d-13-first-run-pairing-ux) (resolved 2026-05-15)
- [ND-01 — Claim-lock timeout duration](#nd-01-claim-lock-timeout-duration) (resolved 2026-05-15)
- [ND-02 — Rejection UX for BUSY response](#nd-02-rejection-ux-for-busy-response) (resolved 2026-05-15)
- [ND-03 — Ring buffer size for attach replay](#nd-03-ring-buffer-size-for-attach-replay) (resolved 2026-05-15)
- [ND-04 — Transcript pagination API shape](#nd-04-transcript-pagination-api-shape) (resolved 2026-05-15)
- [ND-05 — Multi-root workspace marker file precedence](#nd-05-multi-root-workspace-marker-file-precedence) (resolved 2026-05-15)
- [ND-06 — Worktree project identity](#nd-06-worktree-project-identity) (resolved 2026-05-15)
- [ND-07 — Marker file schema](#nd-07-marker-file-schema) (resolved 2026-05-15)
- [ND-09 — Bearer token hashing algorithm](#nd-09-bearer-token-hashing-algorithm) (resolved 2026-05-17)
- [ND-11 — `agentSessionId` capture mechanism](#nd-11-agentsessionid-capture-mechanism) (resolved 2026-05-17)

---

## D-G1: Persona application semantics

**Status:** resolved (2026-05-14)
**Affects:** `prd/03-server.md` §4
**Surfaced by:** Deep-dive analysis G1 (the v0.3 PRD §11 prescribed CLAUDE.md mutation as the persona-injection mechanism, which has race conditions with `/compact` re-reads and pollutes concurrent sessions in the same project)

### Question
What guarantees must Relay uphold when applying a persona to a spawned session, and how should the PRD describe persona application?

### Resolution
The PRD describes persona application as three behavioral guarantees, not as a specific mechanism:

1. **Lifetime** — persona remains in effect for the session's full lifetime, including across all agent-internal state transitions
2. **Isolation** — persona application for one session does not affect concurrent sessions in the same project
3. **Invisibility** — the mechanism is not visible to the developer in the project working directory

The mechanism choice (CLI flags, env vars, transient state Relay owns under `~/.relay/`, etc.) belongs to the implementation phase. Spec content lives in `prd/03-server.md` §4.

**Surfaces new sub-questions:** [[nd-08-skill-subset-enforcement-mechanism]] (surfaced 2026-05-15 by the implementation-pass arch doc `docs/arch/persona-application.md`).

**Propagated to:** `prd/03-server.md` §4 (2026-05-14).

---

## D-G2: Multi-client input arbitration

**Status:** resolved (2026-05-14)
**Affects:** `prd/03-server.md` §5.1, `prd/08-acceptance.md` scenario F, `prd/02-architecture.md`
**Surfaced by:** Deep-dive analysis G2 (the v0.3 PRD said "either client can send input" without defining what happens when N clients are attached and two attempt concurrent input)

### Question
When N clients are attached to a single session, what is the input collaboration model — who can type, what happens when two clients attempt input concurrently, and how does control transfer between clients?

### Context
This contract underpins the multi-device value prop. Without a defined model:
- The user experience is undefined when a developer has both their IDE and phone open on the same session
- Implementation cannot proceed on the WebSocket input-handling path
- Acceptance scenario F (`08-acceptance.md`) cannot be specified or verified
- The mobile PWA design doc (Phase 2) cannot specify whether mobile is read-only-by-default or co-equal

It is also load-bearing for the user mental model: "what happens when both my devices are open" should have a single coherent answer the user can predict.

### Options under consideration
- **Option A — Last-writer-wins.** All clients can type; bytes interleave at the kernel. Simplest to implement but corrupts the agent CLI's prompt parser when two clients type concurrently; acceptable only if interleaving is rare in practice (e.g., chat-style line-buffered input only). Soft variant: line-buffered input with per-client queueing so each Enter-terminated line is atomic.
- **Option B — Primary-with-handoff.** All clients subscribe to output; only the holder of an explicit "control" token can send input. Transfer is a request/grant via WebSocket control message. Mirrors tmate, sshx, and VS Code Live Share. Predictable; non-controlling clients are visibly read-only until they request control.
- **Option C — Observer-mode-by-default with explicit upgrade.** Variant of B where additional clients attach as observers and never auto-promote. Promotion is always an explicit user action. Friendlier for "I just want to peek at what the agent is doing."

### Current thinking
No final lean yet. Option B/C variants align with established multi-attach prior art and avoid the corruption failure mode of A. The exact transfer UX (request/grant flow, timeout, visible indicator) needs design.

### Resolution
The PRD assumes a single user operating across all attached clients (one human, multiple devices). Under that assumption, the input model is a **per-message server-side claim lock** rather than a persistent control-token handoff. The contract:

1. **Claim before send.** Each client input message is wrapped as `CLAIM → SEND → RELEASE` over WebSocket. The server holds at most one active claim per session.
2. **First-arrival wins.** If a `CLAIM` arrives while another is held, the server rejects it with `BUSY`. Ordering is by server arrival time, not client wall-clock.
3. **Losing client preserves the draft.** The rejected client surfaces a brief "another device is interacting with this session" notice and retains the user's local input buffer so nothing is lost.
4. **Auto-release.** Claims release when the message is delivered to the PTY, or after a timeout if the claim is abandoned (e.g., the claiming client disconnects mid-message). Exact timeout → ND-01.
5. **Output is universal.** All clients receive the full output stream regardless of claim state. There is no read-only mode; claim-on-send is the only contention point.

**Why this and not primary-with-handoff (Option B/C):** The persistent-holder model assumes adversarial or coordinating collaborators. With a single user across their own devices, the simpler per-message lock is sufficient: byte interleaving is prevented, the user can't out-race themselves in a way that matters, and there's no holder-transfer UX to design. Claude Code's line-buffered input maps cleanly to per-message granularity. Character-at-a-time interactive apps (vim inside the session) are not the MVP target and would not work cleanly under this lock model — accepted limitation.

**Surfaces new sub-questions:** [[nd-01-claim-lock-timeout-duration]], [[nd-02-rejection-ux-for-busy-response]].

**Propagated to:** `prd/03-server.md` §5.1 (2026-05-14), `prd/08-acceptance.md` scenario F (2026-05-14), `prd/02-architecture.md` Architectural backbone (2026-05-14).

---

## D-G3: Reattach semantics

**Status:** resolved (2026-05-14)
**Affects:** `prd/03-server.md` §5.2, `prd/08-acceptance.md` scenarios D and E, `prd/02-architecture.md`
**Surfaced by:** Deep-dive analysis G3 (the v0.3 PRD said "reattachment is instant" and "conversation continues from where it left off" without specifying what the reattaching client actually sees)

### Question
When a client attaches to a session — whether on initial join or after a disconnect — what does it display? Does the answer differ between initial attach and reattach? Does it differ between client surfaces (IDE terminal vs. mobile)?

### Context
The reattach experience *is* the cross-device value prop. If a developer closes their laptop, opens their phone, and sees a blank terminal because reattach starts at the next byte, the product fails its headline test. Conversely, replaying full history may flash ANSI escapes for several seconds on slow networks, which is also bad UX.

This contract also constrains server-side state: a defined "show last N bytes" or "show pre-rendered snapshot" requires the server to maintain a ring buffer or snapshot. The shape of that state must be decided before implementation.

### Options under consideration
- **Option A — New output only.** Reattaching client sees only bytes emitted after attach. Simplest server-side; worst UX for the headline cross-device test.
- **Option B — Server-side ring buffer replayed on attach.** Server keeps the last N bytes (or N lines, or M seconds) of raw PTY output and replays on every attach. Simple; risks ANSI flash on slow networks; requires picking a window size.
- **Option C — Pre-rendered terminal snapshot.** Server maintains a current terminal-state snapshot (e.g., via xterm.js `SerializeAddon`-equivalent) and sends the snapshot on attach, then live deltas. Cleaner UX; more server CPU per session.
- **Option D — Hybrid.** Snapshot for "where am I now" plus structured transcript (from the agent's session JSONL) for "the conversation so far." Aligns naturally with mobile PWA needs. Highest implementation cost.

### Current thinking
No final lean yet. Option B is a reasonable Phase 1 floor; Option D is the natural Phase 2 evolution if mobile diverges from terminal rendering. Worth deciding the floor and whether the contract differs by client surface.

### Resolution
**Live-forward priority on attach, with a paginated transcript API for historical scroll-back.** The contract:

1. **Live stream is immediate.** On attach (initial or reattach), the server begins streaming current PTY output to the client without delay.
2. **Small initial replay for context.** Alongside live streaming, the server sends a short replay of recent output — target one terminal viewport (~24KB raw bytes). This prevents a blank-terminal experience on reattach without an ANSI-flash storm. Exact size → [[nd-03-ring-buffer-size-for-attach-replay]].
3. **Deeper history is pull-on-demand.** For older context, clients call a paginated transcript API (e.g., `GET /sessions/:id/transcript?before=<offset>&limit=<n>`) and render bytes on demand. This supports the "infinite scroll back in time" experience.
4. **Single contract, two renderings.** Server-side behavior does not branch by client surface. The IDE terminal widget renders bytes inline using the terminal's native scrollback; the (future) mobile PWA renders chat-style with scroll-back pulling from the same API.
5. **Server-side state required:** per-session in-memory ring buffer (~256KB) for the on-attach replay; full transcript persisted via the transcript store (SQLite or JSONL) for the paginated API.

**Why this and not full ring-buffer replay (Option B) or snapshot rendering (Option C):** The headline cross-device test ("close laptop, open phone, see what's happening") passes with just the viewport-sized replay — the user gets current state immediately, then pulls more if they want it. Full replay risks long ANSI flash on slow networks. Snapshot rendering requires terminal-state serialization that's heavier than MVP needs. Reusing the transcript endpoint avoids inventing parallel history mechanisms.

**Promotes:** [[d-04-transcript-export-endpoint]] from Phase 3 audit to MVP — the paginated transcript API is now load-bearing for D-G3.

**Surfaces new sub-questions:** [[nd-03-ring-buffer-size-for-attach-replay]], [[nd-04-transcript-pagination-api-shape]].

**Propagated to:** `prd/03-server.md` §5.2 (2026-05-14), `prd/08-acceptance.md` scenarios D and E (2026-05-14), `prd/02-architecture.md` Architectural backbone (2026-05-14).

---

## D-G6: Project discovery / workspace-to-project binding

**Status:** resolved (2026-05-14)
**Affects:** `prd/04-ide-extension.md` §4
**Surfaced by:** Deep-dive analysis G6 (the v0.3 PRD §9.4 hand-waved auto-detection as "queries the server for a matching project by working directory path" with a CLI fallback)

### Question
How does the IDE extension determine that an open workspace corresponds to a registered Relay project? What is the user-facing flow when the workspace is not yet a project?

### Context
This is the first-run experience for every user, and "kick to CLI" is not a UX. It must work correctly under Remote-SSH (cwd lives on the homelab, not the laptop), git worktrees (multiple paths, one logical project), multi-root workspaces, and symlinked paths.

Cross-device only works if project identity is stable across devices. If two clients on different machines bind the same logical project differently, sessions can't be addressed coherently.

### Options under consideration
- **Option A — Canonicalized absolute path match only.** The extension sends the workspace's canonicalized absolute path; the server looks up by exact match. Simple; brittle under Remote-SSH path differences and worktrees.
- **Option B — Marker file (e.g., `.relay/project.json`).** A registered project drops a marker file in the working directory containing the project ID. The extension reads the marker rather than guessing from the path. Robust across path representations; requires the marker file to be checked in (or gitignored and bootstrapped).
- **Option C — User choice on first detection.** When a workspace opens, the extension presents a quick-pick of "this looks like project X — confirm?" with a path-similarity guess and a "register as new project" affordance. Adds one click but eliminates ambiguity.
- **Option D — Hybrid: marker file when present, fall back to path match, fall back to user choice.** Tiered resolution. Most flexible; most code paths.

### Current thinking
Option B (marker file) plus Option D fallback is the most robust. The marker file is the authoritative bind; path matching is a discovery convenience; user choice catches unmatched cases. Worth confirming the marker file's location and whether it should be gitignored by default.

### Resolution
**Marker file as authoritative bind, user-choice fallback when missing.** Path matching is skipped entirely — it's brittle under Remote-SSH and worktrees and provides no benefit once the marker file exists. The contract:

1. **Marker file location.** A registered project drops `.relay/project.json` at the workspace root, containing at minimum the project ID. Full schema → [[nd-07-marker-file-schema]].
2. **Marker is authoritative.** On workspace open, the IDE extension reads `.relay/project.json` and binds the workspace to that project ID. No path inference, no fuzzy matching.
3. **Missing marker → user choice.** If the file is absent, the extension shows a quick-pick: "Register this workspace as a new project" or "Bind to existing project: [list of known projects on the server]." The user's selection writes the marker.
4. **Gitignored by default.** `relay project create` adds `.relay/project.json` to the workspace's `.gitignore`. The marker carries server-bound identity, not source content, so teammates registering the same repo locally each get their own bind. Users who want a shared bind (e.g., on a homelab where everyone hits the same Relay server) can opt to check the marker in.
5. **Remote-SSH transparency.** The marker lives on the workspace filesystem, so Remote-SSH works with no special handling — the extension reads the file via the same Remote-SSH file API as any other workspace file.

**Why this and not path-match-anywhere:** Path matching fails the cross-device test — Remote-SSH paths differ between laptop and homelab, worktrees give one project multiple paths, symlinks confuse canonicalization. The marker file makes binding stable across all of these by lifting identity into the workspace itself.

**Surfaces new sub-questions:** [[nd-05-multi-root-workspace-marker-file-precedence]], [[nd-06-worktree-project-identity]], [[nd-07-marker-file-schema]].

**Propagated to:** `prd/04-ide-extension.md` §4 (2026-05-14).

---

## D-01: Workspace root vs. subdirectory for start-session

**Status:** resolved (2026-05-14)
**Affects:** `prd/04-ide-extension.md` §4
**Surfaced by:** Original PRD §15 Q1

### Question
Should the extension's start-session command pre-prompt for a working directory, or always use the workspace root?

### Current thinking
Workspace root at MVP. Subdirectory support if anyone asks.

### Resolution
**Always use the workspace root at MVP.** No pre-prompt. The workspace root is the unambiguous default and matches the marker-file location ([[d-g6-project-discovery--workspace-to-project-binding]]). Subdirectory support is a small follow-on if a user surfaces a concrete need (e.g., monorepo with per-package agents). Until then, the simpler flow ships.

**Propagated to:** `prd/04-ide-extension.md` §4 (2026-05-14).

---

## D-02: PWA initial server discovery

**Status:** deferred (until Phase 2 PWA work begins)
**Affects:** `prd/05-mobile-pwa.md`
**Surfaced by:** Original PRD §15 Q2

### Question
How does the PWA discover the Relay server initially — hardcoded URL during pairing, or mDNS-style discovery on LAN?

### Current thinking
QR code at pairing time carries the URL. mDNS discovery deferred.

### Resolution
**Deferred** — the PWA is Phase 2 scope and this decision lands when that work begins.

**MVP behavior:** N/A — Phase 1 ships without a mobile PWA, so server discovery is not needed.

**Default direction when Phase 2 picks this up:** QR code at pairing time carries the URL. mDNS-style LAN discovery deferred further unless concrete user demand surfaces (e.g., setups where pairing must work without screen-to-screen QR transfer).

**Re-open trigger:** Phase 2 mobile PWA design doc begins.

---

## D-03: MCP set changes mid-session

**Status:** resolved (2026-05-14)
**Affects:** `prd/03-server.md`
**Surfaced by:** Original PRD §15 Q3

### Question
What happens if a persona's MCP server list changes while a session is running?

### Current thinking
No-op. MCP set is locked at session spawn. Restart for changes to take effect.

### Resolution
**MCP set is locked at session spawn time.** Changes to a persona's MCP server list while a session is running are a no-op for that session — the running agent process continues with whatever MCP set was in effect when it was spawned. Operators apply changes by stopping and restarting the session; surfaced in the IDE/CLI as an explicit restart-required indicator on the session.

**Why:** Mutating MCP wiring on a live agent process risks half-configured tool calls and out-of-band failure modes. A clean "stop, restart, new MCP set" boundary is simpler to reason about and matches how the underlying agent CLIs treat tool configuration.

**Propagated to:** `prd/03-server.md` §9 (2026-05-14).

---

## D-04: Transcript export endpoint

**Status:** resolved (2026-05-14)
**Affects:** `prd/03-server.md` §2
**Surfaced by:** Original PRD §15 Q4

### Question
Should the server expose a transcript export endpoint for offline review?

### Current thinking
Yes, `GET /sessions/:id/transcript` returns full JSON. Useful for backups and Phase 4 audit.

### Resolution
**Yes — and promoted to MVP because [[d-g3-reattach-semantics]] depends on it for historical scroll-back.** `GET /sessions/:id/transcript` is a Phase 1 endpoint with two modes:

1. **Full export.** `GET /sessions/:id/transcript?format=full` returns the whole session transcript as JSON. Use case: backups, offline review, future audit.
2. **Paginated read.** `GET /sessions/:id/transcript?before=<offset>&limit=<n>` returns a slice of bytes anchored before a given offset, capped at `<n>`. Use case: client-side infinite scroll-back from D-G3.

Exact pagination shape (offset-vs-cursor, byte-vs-message indices, response framing) → [[nd-04-transcript-pagination-api-shape]].

**Why promoted:** D-G3's "live forward + scroll back" UX needs an API for pulling older bytes on demand. Inventing a parallel history mechanism just for reattach would duplicate this endpoint, so it ships in Phase 1 instead of Phase 3.

**Propagated to:** `prd/03-server.md` §2 (2026-05-14).

---

## D-05: Per-device token rotation

**Status:** deferred (until Phase 3 hardening)
**Affects:** `prd/03-server.md` §6
**Surfaced by:** Original PRD §15 Q5

### Question
What is the per-device token rotation policy?

### Current thinking
Indefinite at MVP, revocable via CLI. Rotation in Phase 3.

### Resolution
**Deferred** — rotation is a Phase 3 hardening concern.

**MVP behavior:** Per-device tokens are issued at pairing time and are valid indefinitely. They can be revoked via CLI (`relay token revoke <device>`). No automatic rotation, no expiry.

**Why deferred:** Token rotation requires designing a refresh flow, handling rotation-in-flight failures, and propagating to all attached clients. None of this is load-bearing for Phase 1's "it works on my homelab" target. The MVP behavior is acceptable for a self-hosted, single-user system; rotation matters when multi-tenant or shared-infrastructure deployment becomes a goal.

**Re-open trigger:** Phase 3 hardening, OR any earlier multi-tenant deployment surfaces.

---

## D-06: Persona inheritance

**Status:** resolved (2026-05-14)
**Affects:** `prd/01-conceptual-model.md`
**Surfaced by:** Original PRD §15 Q6

### Question
Should personas support inheritance (one persona extends another)?

### Current thinking
No at MVP. Personas are flat YAML. Composition handled by enabling skill subsets.

### Resolution
**No inheritance at MVP.** Personas are flat YAML definitions. Composition is handled by enabling skill subsets — if a user wants "architect + dev capabilities," they create a persona whose skill list is the union of what they want, not by extending one persona from another.

**Why:** Inheritance adds resolution-order complexity (override semantics, deep-vs-shallow merge, diamond cases) that's not justified at the MVP scale. Users have at most a handful of personas; duplication of a few YAML lines is cheaper than the cognitive overhead of an inheritance model.

**Re-evaluate if:** persona counts grow into double digits per user and duplication becomes a maintenance burden.

**Propagated to:** `prd/01-conceptual-model.md` Persona entity (2026-05-14).

---

## D-07: Transcript stream capture layer

**Status:** resolved (2026-05-14)
**Affects:** `prd/03-server.md`
**Surfaced by:** Original PRD §15 Q7

### Question
Where does the agent CLI's `stdout` get captured for the transcript stream — at the PTY layer, or by parsing Claude Code's `--output-format json`?

### Current thinking
PTY layer. Raw stream is the source of truth. JSON parsing reserved for Phase 3 structured features.

### Resolution
**Capture at the PTY layer.** The raw PTY byte stream is the source of truth for the transcript. JSON-format parsing of `--output-format json` is reserved for Phase 3 structured features (e.g., per-message annotations, tool-call analysis).

**Why:** The PTY stream is what the human sees — capturing there means the transcript matches the user's lived experience exactly, including ANSI rendering, prompts, and interactive sequences. It's also agent-CLI-agnostic: any future agent we wrap (Codex, Gemini CLI, etc.) emits to a PTY whether or not it has a structured output format. Parsing JSON would couple us to one CLI's protocol shape.

**Propagated to:** `prd/03-server.md` §10 (2026-05-14).

---

## D-08: Single binary vs. separate packages

**Status:** resolved (2026-05-14)
**Affects:** `prd/06-distribution.md`
**Surfaced by:** Original PRD §15 Q8

### Question
Single binary vs. separate `relay-server` and `relay-cli` packages?

### Current thinking
Single binary with subcommands. Simpler distribution.

### Resolution
**Single binary with subcommands.** One `relay` executable with subcommands like `relay server`, `relay project`, `relay token`, etc. One install path, one version to track, one set of release artifacts.

**Why:** Splitting into separate `relay-server` and `relay-cli` packages doubles the distribution surface (npm, Docker, Helm, version-pinning) for no functional benefit — operators always need both anyway. The single binary is also simpler for container images: one binary copy, one entrypoint.

**Propagated to:** `prd/06-distribution.md` Packaging shape (2026-05-14).

---

## D-09: Persona YAML schema

**Status:** resolved (2026-05-15)
**Affects:** `prd/09-persona-schema.md` (new), `prd/03-server.md` §3, `prd/01-conceptual-model.md`, `prd/07-phasing.md`
**Surfaced by:** Doc audit (2026-05-15)

### Question
What fields does a persona YAML file contain, where do those files live on disk, and how do tenant- and project-level definitions compose?

### Context
Phase 1 ships seven default personas (`product`, `design`, `dev`, `test`, `infra`, `architect`, `review`) as YAML. The persona authoring guide, `relay persona create` template, and the default-persona set all depend on a stable schema. The conceptual model in `prd/01-conceptual-model.md` names the bundle as (system prompt overlay, skill subset, MCP subset, optional model) but the file format has not been specified.

### Resolution
**A flat YAML schema with required `name` + `schemaVersion` and optional content fields, stored under `~/.relay/personas/<name>.yaml` (tenant) and `<project>/.relay/personas/<name>.yaml` (project override).** The contract:

1. **File location and naming.** Tenant-level definitions live in `~/.relay/personas/<name>.yaml`; project-level overrides live in `<project>/.relay/personas/<name>.yaml`. The filename stem (sans `.yaml`) is the persona's canonical name; the `name:` field inside the file must match the stem and is the authoritative identifier.
2. **Required fields.** `schemaVersion: 1` (integer) and `name: <slug>` (kebab-case, must match filename).
3. **Optional fields.** `description` (one-line human-readable), `systemPrompt` (multi-line string, appended to the agent's own prompt at session spawn — the persona application mechanism is the implementation's choice per [[d-g1-persona-application-semantics]]), `skills` (list of skill names; omitted or `null` means "all skills available to the agent"), `mcpServers` (list of MCP server names; same omitted-means-all rule), `model` (model identifier passed to the agent CLI; omitted means agent default).
4. **Composition: override, not merge.** When a project-level file shares a name with a tenant-level file, the project file fully replaces the tenant file for that session. There is no per-field merging — consistent with [[d-06-persona-inheritance]]'s "no inheritance, no extends" stance.
5. **Validation at load.** The server validates required fields and `schemaVersion` on read. A file that fails validation is logged and excluded from the persona list; it does not block server startup.
6. **Skill and MCP name resolution.** Names in `skills:` refer to directory names under `~/.claude/skills/` and `<project>/.claude/skills/`; names in `mcpServers:` refer to keys in the agent CLI's native MCP configuration (`~/.claude.json`, `<project>/.mcp.json`). Relay does not own these registries — see the native configuration preservation guarantee in `prd/03-server.md` §8.
7. **Schema evolution.** `schemaVersion` is the forward-compat signal: a server that sees a higher `schemaVersion` than it understands logs and excludes the file (same path as validation failure). Breaking schema changes bump the integer.

**Why a flat schema and not a richer one:** Inheritance was already rejected ([[d-06-persona-inheritance]]); adding back nested composition, conditionals, or partial overrides would re-litigate that decision. The flat shape matches the conceptual model 1:1 and keeps the persona authoring guide short.

**Why filename-as-name and not a free-form `name:` field:** Filename collisions are what trigger override resolution (project file replaces tenant file with the same name). Decoupling the filename from the `name:` would require Relay to scan every file just to discover names, and would make override semantics depend on file *contents* rather than file *paths* — fragile and surprising.

**Propagated to:** `prd/09-persona-schema.md` (new, 2026-05-15), `prd/03-server.md` §3 (2026-05-15), `prd/01-conceptual-model.md` Persona entity (2026-05-15), `prd.md` index table (2026-05-15).

---

## D-10: Agent model credentials handling

**Status:** resolved (2026-05-15)
**Affects:** `prd/03-server.md` §3, `prd/06-distribution.md`
**Surfaced by:** Doc audit (2026-05-15)

### Question
How does Relay obtain and propagate model credentials (Anthropic API key or other provider creds) to the spawned agent process?

### Context
Claude Code requires Anthropic credentials (or other provider credentials) to run. The PRD is silent on how those credentials reach the agent process from the operator. This blocks the deployment guide and shapes whether credentials need to be modelled at the persona, project, or server level.

### Resolution
**Server-level environment variables, passed unmodified to spawned agent processes.** Operators set credentials in Relay's own environment (e.g., `ANTHROPIC_API_KEY=...` in the systemd unit, container env, or shell that launches `relay server`); Relay propagates the relevant variables into each `node-pty` spawn without inspection or rewriting. No per-persona or per-project credential overrides at MVP. The contract:

1. **Server env is the source.** Relay reads `ANTHROPIC_API_KEY` (and any other provider-specific variables the wrapped agent CLI natively consumes) from its own process environment at agent-spawn time.
2. **Pass-through, not interpretation.** Relay forwards the variables into the spawned agent's environment unchanged. It does not parse, validate, mask, or persist them.
3. **No YAML, no DB.** Credentials are never written to persona YAML, project metadata, or the SQLite state file. There is no `apiKey:` field in the persona schema ([[d-09-persona-yaml-schema]]).
4. **One credential set per server.** All sessions on a given Relay server share the same credentials. Operators who need credential isolation run separate Relay servers.

**Why server env and not per-persona credentials:** Per-persona credentials would store secrets in YAML or the DB, contradict the native-configuration-preservation principle (Claude Code's own credential model is env-driven), and add a credential-precedence resolver no Phase 1 user has asked for. The env-var pass-through inherits whatever credential model the wrapped agent CLI already supports, which is the most agent-agnostic option.

**Re-evaluate if:** multi-tenant deployment surfaces (Phase 3+) and per-tenant credentials become a hard requirement.

**Propagated to:** `prd/03-server.md` §3 (2026-05-15), `prd/06-distribution.md` Configuration (2026-05-15).

---

## D-11: Server restart and session orphaning

**Status:** resolved (2026-05-15)
**Affects:** `prd/01-conceptual-model.md`, `prd/03-server.md`, `prd/08-acceptance.md` scenario A
**Surfaced by:** Doc audit (2026-05-15)

### Question
When the Relay server restarts, what happens to sessions that were `running` at shutdown? Phase 0 says "preserves session metadata but kills the agent process" — Phase 1 needs to commit to what the post-restart session state looks like and whether anything is auto-restarted.

### Context
A server restart (operator action, crash, container redeploy) inevitably kills every spawned agent process — they live as `node-pty` children of the server. Their session records, transcripts, and `agent_session_id` references are still on disk in SQLite. The PRD has not said what state those records land in, whether the operator must clean them up, or whether Phase 3's `claude --resume` flow can reanimate them.

### Resolution
**Orphaned `running` sessions auto-transition to `killed` at server boot. Metadata (project, persona, transcript, `agent_session_id`) is preserved. No auto-relaunch.** The contract:

1. **Boot-time scan.** When `relay server` starts, it queries SQLite for sessions with `status = running` and transitions each to `killed` with a `terminated_reason = "server_restart"` annotation. The transition is unconditional — if the row was `running`, the PTY is gone, so the status was already lying.
2. **Metadata preserved.** The session record itself is not deleted. The project ID, persona ID, agent CLI choice, `agent_session_id`, transcript bytes, and timestamps remain. The session is queryable via `GET /sessions/:id` and listable (filtered by status) via `GET /sessions?status=killed`.
3. **No auto-relaunch.** Relay does not attempt to spawn a replacement agent process for a killed session. The user explicitly starts a new session if they want to continue work — at MVP this is a fresh agent process; at Phase 3, the new session may be created with the prior session's `agent_session_id` to resume via `claude --resume`.
4. **`relay session list` default filter.** Defaults to `status=running` to avoid drowning users in killed sessions across restarts. `--all` shows everything; `--status killed` filters explicitly.
5. **Acceptance.** Scenario A in `08-acceptance.md` is extended to cover this: after a server restart, sessions that were running before the restart appear in `relay session list --status killed` with their metadata intact; the project/persona/token persistence already in scenario A continues to apply.

**Why auto-mark `killed` and not auto-relaunch:** Auto-relaunch can't reproduce a session — Claude Code's mid-session state lives inside the agent process, and even a `--resume` start would not be byte-identical. Silent auto-relaunch would also surprise the user with a session that "kept going" while they were watching the server restart. Explicit "the agent died, start a new one or resume in Phase 3" is the honest contract.

**Why preserve metadata and not garbage-collect:** The transcript is the user's record of work. Deleting it on restart would lose data; archiving without a retention policy is the simpler default. A retention policy can land in Phase 3 alongside transcript-store hardening if it becomes necessary.

**Propagated to:** `prd/01-conceptual-model.md` Session entity (2026-05-15), `prd/03-server.md` §3 (2026-05-15), `prd/08-acceptance.md` scenario A (2026-05-15).

---

## D-12: Project record storage and `relay project add` semantics

**Status:** resolved (2026-05-15)
**Affects:** `prd/03-server.md` §3, §7; `prd/04-ide-extension.md` §4; `prd/06-distribution.md`; `prd/02-architecture.md`
**Surfaced by:** Doc audit (2026-05-15)

### Question
When `relay project add <path>` runs, what does it persist and where? Is the user-supplied path the canonical working directory (registered in place), or is it copied/symlinked into the configurable `/projects/` path? How is the project display name derived? What is the SQLite record's shape? And the `add` vs. `create` naming discrepancy (D-G6 used `relay project create`) needs to be reconciled.

### Context
`02-architecture.md` shows `/projects/<name>/` in the filesystem diagram and `06-distribution.md` says project working directories live under a configurable path (default `/projects/` in container, `~/projects/` in local mode). `03-server.md` §7 lists `relay project add <path>` without semantics. D-G6 referenced `relay project create` colloquially as the operation that writes the marker file. The implementation needs one verb and one source of truth.

### Resolution
**`relay project add <path>` registers the user-supplied path in place — no copy, no symlink, no rewriting. The canonical working directory is exactly what the user passed.** The contract:

1. **In-place registration.** Relay does not move, copy, or symlink the project working directory. The path passed to `relay project add` is the canonical path stored on the project record. The `/projects/` and `~/projects/` paths from `06-distribution.md` are *conventions* for where operators commonly mount or check out source — they are not Relay-owned directories.
2. **Path canonicalization.** Relay resolves the path with `realpath` once at registration (resolving symlinks, normalizing `..` and trailing slashes) and stores the canonical form. Re-registering the same canonical path is an error (`409 Conflict`); registering a different path that resolves to the same canonical form is also an error.
3. **Display name.** Defaults to the canonical path's basename. Overridable via `--name <slug>` on the CLI; the slug must be kebab-case, unique per tenant, and stable across renames (rename changes the display name only, not the slug or ID).
4. **Project ID.** Server-issued ULID at registration. This is the `projectId` that goes into the marker file (see [[nd-07-marker-file-schema]]).
5. **SQLite record.** Each project row carries: `id` (ULID, PK), `tenant_id`, `slug` (unique per tenant), `display_name`, `canonical_path`, `agent_cli` (default `claude` at MVP), `created_at`, `updated_at`. Persona overrides, skills, and MCP entries live as files on disk (see `09-persona-schema.md`); the DB row tracks identity and ownership only.
6. **Marker file write.** `relay project add` writes `<canonical_path>/.relay/project.json` with the schema from [[nd-07-marker-file-schema]] and appends `.relay/project.json` to the project's `.gitignore` (creating the file if absent). The marker write is part of the `add` operation — there is no separate "create marker" step.
7. **IDE registration parity.** The IDE's "Register this workspace as a new project" quick-pick from `prd/04-ide-extension.md` §4 calls `POST /projects` (the REST primitive) with the workspace root path. The server-side handler is the same code path as `relay project add` — the IDE is not invoking the CLI under the hood.
8. **CLI verb is `add`, not `create`.** Earlier prose colloquially used `relay project create`; the canonical verb is `relay project add <path>`. Doc references to `create` are normalized to `add`.

**Why in-place and not copy-to-`/projects/`:** Copying the working directory inverts the user's git workflow — they would push from `/projects/<name>/` instead of from where they checked out. Symlinking introduces realpath surprises across editors and tools. In-place registration matches how `git`, `cargo`, `npm`, and every other developer tool treats the working tree.

**Why ULID and not a hash of the path:** Path-derived IDs leak path content into the API surface and break if the user moves the checkout. A server-issued opaque ID survives path changes and matches how the rest of the system addresses entities.

**Propagated to:** `prd/03-server.md` §3 (2026-05-15), `prd/03-server.md` §7 (2026-05-15), `prd/04-ide-extension.md` §4 (2026-05-15), `prd/06-distribution.md` Persistence (2026-05-15), `prd/02-architecture.md` filesystem diagram (2026-05-15), `prd/08-acceptance.md` scenario A (2026-05-15).

---

## D-13: First-run pairing UX

**Status:** resolved (2026-05-15)
**Affects:** `prd/03-server.md` §6, `prd/04-ide-extension.md` §4
**Surfaced by:** Doc audit (2026-05-15)

### Question
How does the device-pairing flow work end-to-end between `relay init` on the server and the IDE extension's first-run prompt? `03-server.md` §6 commits to bearer-token-via-out-of-band but the user-visible UX has not been spelled out.

### Context
The first-run experience for every Relay user begins with this flow. If a developer cannot get past "I started the server, now what?" within a minute, the product fails its self-host posture. The mobile PWA's QR-code pairing builds on the same primitive but is Phase 2 scope.

### Resolution
**`relay init` emits a single copy-paste snippet on stdout; the IDE extension first-run prompt accepts that snippet whole or its constituent parts; tokens are long-lived and reusable until revoked.**

1. **`relay init` output.** After generating config and the initial token, `relay init` prints (and writes to `~/.relay/last-pairing.txt`) a snippet of the form:
   ```
   Relay is ready. Pair your IDE extension by pasting this:
       relay://pair?url=https://relay.homelab.lan&token=01HXYZ...
   Or by URL + token separately:
       Server URL: https://relay.homelab.lan
       Token:      01HXYZ...
   ```
   The `relay://pair?...` URL is a single-token-payload deep link; the URL and token printed separately are the same values in unstructured form for users who can't use the deep link.
2. **IDE extension first-run.** The extension command-palette entry "Relay: Connect to server" presents a single text input. The user pastes either the `relay://pair?...` URL or pastes the URL and token in two separate fields (toggle in the prompt). The extension validates by issuing an authenticated probe (e.g., `GET /tenants/self`) and on success stores the values in VS Code secret storage.
3. **No server-side confirmation step.** The first authenticated use of a token is the pairing handshake — there is no "approve this device" prompt on the server. The tradeoff is intentional: this is single-user self-host, the token is the only secret, and a "confirm pairing" step adds a coordination round trip that has no security value here (the user holds both ends).
4. **Tokens are long-lived and reusable.** A token issued by `relay init` is valid indefinitely until `relay token revoke` runs (see [[d-05-per-device-token-rotation]] for the long-term rotation story, deferred to Phase 3). The same token can pair multiple devices; operators who want per-device tokens use `relay token create --device <name>` to issue distinct tokens before pairing each device.
5. **Format and entropy.** Tokens are 26-character Crockford-Base32 strings carrying ≥128 bits of entropy. They are stored hashed in `~/.relay/tokens.json` and the plaintext is shown to the operator exactly once (at issue time).
6. **Mobile PWA reuse.** The Phase 2 mobile QR code encodes the same `relay://pair?...` URL. Phase 1 ships only the desktop flow; mobile pairing arrives with the PWA work.

**Why no server-side approval step:** A self-hosted single-user posture is exactly the case where "approve this device" is friction with no security value. If the token leaks, the right answer is `relay token revoke`, not a manual approval gate that the user would always click "yes" on anyway. This is restated in the auth section ([[d-05-per-device-token-rotation]]'s deferral).

**Why the `relay://pair?...` URL and the plain text both:** Some terminals don't honor URL handlers; some IDEs strip query strings on paste. Offering both forms means a one-paste path when the deep link works and a fallback that always works.

**Propagated to:** `prd/03-server.md` §6 (2026-05-15), `prd/04-ide-extension.md` §4 (2026-05-15).

---

## D-14: Product name

**Status:** deferred (until pre-launch naming review)
**Affects:** `prd.md`, `prd/06-distribution.md`, repo slug, npm package name, OpenVSX listing
**Surfaced by:** Doc audit (2026-05-15)

### Question
Is "Relay" the final product name, or a working name to be replaced before public launch?

### Context
`prd.md` carries `Working name: Relay (TBD)`. The name doesn't block Phase 1 implementation but it does block the *publishable* artifacts: the npm package (currently `@relay/relay` in `06-distribution.md`), Docker image tag, GitHub repo slug, OpenVSX listing, and any first-party domain. Settling on a name late risks renaming across all of these in a hurry.

### Resolution
**Deferred** — the name is not load-bearing for Phase 1 implementation; the naming review happens before the first publishable artifact ships.

**MVP behavior:** "Relay" is the working name through Phase 1 implementation. All internal docs, CLI binary names (`relay`), config paths (`~/.relay/`), and protocol markers (`.relay/project.json`) use it. A future rename, if it happens, will be a mechanical refactor across these surfaces.

**Default direction when picked up:** Conflict-check "Relay" against existing npm packages, GitHub orgs, OpenVSX entries, and trademark databases. If clear and not too generic, keep it. If conflicts surface, pick from a shortlist that preserves the "small piece of infrastructure between two endpoints" connotation.

**Re-open trigger:** Before the first public artifact publishes (npm, Docker Hub, OpenVSX, GitHub public release). Likely Phase 1 end or Phase 2 start.

---

## ND-01: Claim-lock timeout duration

**Status:** resolved (2026-05-15)
**Affects:** `prd/03-server.md` §5.1
**Surfaced by:** [[d-g2-multi-client-input-arbitration]] resolution

### Question
How long does a held claim survive without a follow-up `SEND` before the server auto-releases? The claim model in D-G2 needs a timeout to prevent deadlock when a client claims but disconnects before sending (e.g., laptop closed mid-keystroke).

### Resolution
**Single fixed timeout of 30 seconds from server-side `CLAIM` acknowledgment.** If no `SEND` or `RELEASE` arrives on the claiming connection within that window, the server auto-releases the lock and a subsequent `CLAIM` from any client can succeed.

1. **Trigger.** The timer starts when the server acknowledges `CLAIM`. It does not re-arm on activity — a single 30-second window per claim.
2. **Reset.** A `SEND` on the same connection consumes the claim and clears the timer (claim auto-releases on PTY delivery per D-G2). No keepalive ping is recognized; line-buffered semantics mean `SEND` is the only legitimate activity during a claim.
3. **Disconnect.** A WebSocket close from the claiming client releases the claim immediately, ahead of the 30-second budget.
4. **Configurable.** The value is the server default, settable in `~/.relay/config.yaml` for operators who need a different posture; the wire contract does not negotiate per-claim.

**Why 30 seconds and not a tiered model:** A tab-blur or brief network blip resolves in well under a second; 30 seconds tolerates a normal "I started typing, glanced away to check Slack, finished typing" pause without losing the claim. A closed laptop will typically also tear down the WebSocket within seconds, hitting the disconnect path before the timeout matters. A tiered model ("short while empty, longer while sending") doesn't earn its complexity under line-buffered input where a `SEND` is atomic and short-lived.

**Propagated to:** `prd/03-server.md` §5.1 (2026-05-15).

---

## ND-02: Rejection UX for BUSY response

**Status:** resolved (2026-05-15)
**Affects:** `prd/04-ide-extension.md`, `prd/05-mobile-pwa.md`
**Surfaced by:** [[d-g2-multi-client-input-arbitration]] resolution

### Question
When a client's `CLAIM` is rejected with `BUSY`, what does the user see? The D-G2 resolution requires the losing client's draft to be preserved and a brief notice to be shown, but the exact rendering and retry behavior is unspecified.

### Resolution
**A one-shot, dismissible notice anchored near the input; no auto-retry; local buffer preserved.** Both client surfaces follow the same contract; only the visual primitive differs.

1. **Anchoring.** The notice appears adjacent to the input area (status-bar-row in the IDE terminal widget; inline above the compose field in the PWA). It does not appear as a global toast that obscures session output.
2. **Wording.** "Another device is interacting with this session." Short, low-alarm, no jargon ("CLAIM", "BUSY", "lock").
3. **Lifecycle.** The notice dismisses automatically after 4 seconds, or immediately when the user starts typing again or hits Enter again — whichever comes first.
4. **No auto-retry.** The client does not silently re-attempt the claim. The user retries by pressing Enter; the rejected message is still in their local input buffer untouched, so retry is a single keystroke.
5. **No queueing.** A rejected message is not held server-side and re-sent when the other claim releases. The user owns the retry decision; the server is stateless between messages per [[d-g2-multi-client-input-arbitration]].

**Why no auto-retry:** Auto-retry from the rejected client races with the other device's input cadence — the same user could end up sending a stale prompt seconds after they've already moved on with the other device. A manual retry keeps the user's intent explicit.

**Propagated to:** `prd/03-server.md` §5.1 (2026-05-15), `prd/04-ide-extension.md` §4 (2026-05-15), `prd/05-mobile-pwa.md` §3a (2026-05-15).

---

## ND-03: Ring buffer size for attach replay

**Status:** resolved (2026-05-15)
**Affects:** `prd/03-server.md` §5.2
**Surfaced by:** [[d-g3-reattach-semantics]] resolution

### Question
What size is the per-session in-memory ring buffer that holds recent PTY output for on-attach replay? The D-G3 resolution targets "~24KB / one terminal viewport" but the exact value, and whether it's a global default or per-session configurable, is unspecified.

### Resolution
**32 KB global server default, configurable via `~/.relay/config.yaml`; no per-session knob.** This is the size of the on-attach replay window only; deeper history is pulled from the transcript API per [[d-04-transcript-export-endpoint]].

1. **Sizing rationale.** A 120-column × 40-row desktop terminal viewport with typical ANSI overhead is ≈19 KB; a phone landscape terminal (80×24) is ≈8 KB. 32 KB comfortably covers a full desktop viewport plus a Claude Code prompt-state worth of preceding context (the last agent response header, tool-call output, etc.).
2. **Ring buffer mechanics.** A circular byte buffer per session; new PTY bytes append and overwrite the oldest. No line-awareness — bytes are bytes, consistent with PTY-layer capture per [[d-07-transcript-stream-capture-layer]].
3. **Configuration.** Operators set `replayBufferBytes` in `~/.relay/config.yaml` to override the 32 KB default. Changes take effect for sessions spawned after the config reloads.
4. **No per-session override.** The buffer size is uniform across all sessions on a server. Per-session tuning is not justified at MVP; long historical context is what the transcript API exists for.

**Why 32 KB and not the literal 24 KB from D-G3:** 24 KB was the order-of-magnitude target; 32 KB is a round binary value that gives margin for ANSI-heavy output (color codes, cursor positioning, progress bars) without inflating server memory per session. With ~100 concurrent sessions at MVP, total replay-buffer memory is ~3 MB — negligible.

**Propagated to:** `prd/03-server.md` §5.2 (2026-05-15).

---

## ND-04: Transcript pagination API shape

**Status:** resolved (2026-05-15)
**Affects:** `prd/03-server.md` §2
**Surfaced by:** [[d-g3-reattach-semantics]] resolution, [[d-04-transcript-export-endpoint]] resolution

### Question
What is the exact shape of the paginated transcript API (`GET /sessions/:id/transcript?...`)? D-G3 and D-04 reference the endpoint but don't pin down pagination semantics, identifier types, or response framing.

### Resolution
**Byte-offset pagination, exclusive upper bound, base64 byte payload, same response shape for both clients.** Because PTY-layer capture ([[d-07-transcript-stream-capture-layer]]) gives us a flat byte stream with no message structure, bytes are the only natural addressable unit at MVP.

1. **Paginated read.** `GET /sessions/:id/transcript?before=<byte_offset>&limit=<n>` returns bytes in the half-open range `[max(0, before - limit), before)`. `before` is an **exclusive** upper bound (the byte at `before` is *not* included in the response); the client passes the lowest `from` it has previously received as the next call's `before` to walk backward.
2. **`limit`.** Byte count cap. Server enforces a hard maximum of 1 MB per call; requests with larger `limit` are silently clamped to 1 MB.
3. **Response framing.**
   ```json
   {
     "session_id": "<uuid>",
     "range": { "from": 0, "to": 32768 },
     "total_bytes": 1048576,
     "bytes": "<base64-encoded raw PTY bytes>",
     "has_more": true
   }
   ```
   `range.from` and `range.to` are inclusive-from / exclusive-to byte offsets relative to the session's first captured byte (offset 0). `has_more` is `true` when `range.from > 0` — i.e., there is older content to fetch.
4. **Full export.** `GET /sessions/:id/transcript?format=full` returns the same shape with `range = { from: 0, to: total_bytes }` and the entire transcript in `bytes`. The two modes are mutually exclusive query-string shapes.
5. **Initial scroll-back call.** The first call from a freshly-attached client uses `before=<total_bytes>` (returned in the session's metadata on attach) and the client's preferred `limit`.
6. **No cursor opacity.** Offsets are stable for the lifetime of the session — PTY bytes are append-only and never rewritten. Cursor-based pagination buys nothing here and would obscure what the client is asking for.
7. **Both renderings consume the same response.** The IDE terminal widget feeds `bytes` (after base64 decode) straight into its PTY renderer; the PWA chat renderer decodes the same `bytes` and applies its own chat-style framing. Server logic does not branch by client.

**Why byte offsets and not message indices:** D-07 commits the transcript to PTY-layer bytes precisely because message structure is agent-CLI-specific. Adding a message index would either reintroduce that coupling or require a parallel structure pipeline we don't have at MVP.

**Why exclusive `before` and not inclusive:** Walking backward is "give me N bytes ending before what I already have." Exclusive avoids off-by-one duplication when the client chains calls.

**Propagated to:** `prd/03-server.md` §2 (2026-05-15).

---

## ND-05: Multi-root workspace marker file precedence

**Status:** resolved (2026-05-15)
**Affects:** `prd/04-ide-extension.md` §4
**Surfaced by:** [[d-g6-project-discovery--workspace-to-project-binding]] resolution

### Question
When a VS Code workspace has multiple root folders and more than one carries a `.relay/project.json` marker, which marker binds the session? And what happens when none of the roots have a marker — does the user-choice fallback apply once for the workspace or once per root?

### Resolution
**Each root folder is evaluated independently; a multi-root workspace maps to N projects, not one.** "Start session" operates on the active editor's containing root folder.

1. **Per-root binding.** Each root folder in a multi-root workspace is treated as its own project candidate. Each can carry its own `.relay/project.json`; each binds independently.
2. **"Start session" target.** The command resolves the target project by looking up the active editor's URI and finding which root folder contains it. The session's working directory is that root folder. If no editor is active, the command surfaces a quick-pick of root folders to choose from.
3. **Missing marker → per-root user-choice.** The fallback from `prd/04-ide-extension.md` §4 fires for the specific root being targeted, not for the workspace as a whole. Registering one root has no effect on sibling roots.
4. **Status bar follows focus.** The status bar item shows the project bound to the root folder containing the currently focused editor, swapping as the user navigates between roots.
5. **No workspace-level "primary project."** The conceptual model treats a project as 1:1 with a working tree. A multi-root workspace is a UX convenience for editing several trees side-by-side, not a higher-order container.

**Why per-root and not workspace-level:** Workspace-level binding would force a "primary project" choice that has no analogue in the conceptual model. It also creates the worse failure mode: a user adds a second root with its own `.relay/project.json`, and the workspace silently keeps using the first root's project. Per-root binding has no ambiguity.

**Propagated to:** `prd/04-ide-extension.md` §4 (2026-05-15), `prd/01-conceptual-model.md` Project entity (2026-05-15).

---

## ND-06: Worktree project identity

**Status:** resolved (2026-05-15)
**Affects:** `prd/01-conceptual-model.md`, `prd/04-ide-extension.md`
**Surfaced by:** [[d-g6-project-discovery--workspace-to-project-binding]] resolution

### Question
For git worktrees, do all worktrees of one repo share a single Relay project (same project ID across all worktree paths) or is each worktree its own bound project? The marker file decision in D-G6 makes either possible, but the conceptual model needs to commit to one.

### Resolution
**Per-worktree identity. Each worktree is its own Relay project with its own marker file and project ID.** This is consistent with the conceptual-model commitment that a project is 1:1 with a working tree (see [[nd-05-multi-root-workspace-marker-file-precedence]] for the multi-root analogue).

1. **Identity unit.** A Relay project corresponds to one filesystem working tree, not a logical codebase. Two worktrees of the same repo are two projects.
2. **Marker per worktree.** Each worktree gets its own `.relay/project.json` written into the worktree's root. Worktrees added after `relay project create` are not retroactively registered — the user runs the bind flow per worktree.
3. **Sessions are scoped to worktrees.** A session opened in worktree A appears in worktree A's project session list, not in worktree B's. `relay session list` shows both as distinct sessions on distinct projects.
4. **Personas independent per worktree.** Each worktree can carry its own `<worktree>/.relay/personas/` overrides per [[d-09-persona-yaml-schema]]. A persona override applied in worktree A does not affect worktree B.
5. **Cross-device addressability.** Project ID is the address, and project IDs differ across worktrees, so cross-device attach is unaffected — clients address sessions by ID, not by path.

**Why per-worktree and not codebase-wide:** Worktrees are commonly used for in-progress work on parallel branches (one worktree per feature). Sharing a single Relay project across them would conflate sessions that are conceptually separate, surface persona overrides cross-contamination, and make `relay session list` ambiguous about which session belongs to which working tree. The conceptual cost of "git users see N projects for N worktrees" is small and matches how git itself treats worktrees as discrete check-outs.

**Propagated to:** `prd/01-conceptual-model.md` Project entity (2026-05-15), `prd/04-ide-extension.md` §4 (2026-05-15).

---

## ND-07: Marker file schema

**Status:** resolved (2026-05-15)
**Affects:** `prd/04-ide-extension.md` §4
**Surfaced by:** [[d-g6-project-discovery--workspace-to-project-binding]] resolution

### Question
What fields does `.relay/project.json` contain? D-G6 commits to at-minimum a project ID; the rest of the schema (server URL, display name, schema version, forward-compat behavior) is open.

### Resolution
**Two required fields (`schemaVersion`, `projectId`) plus optional `serverUrl` and `displayName`. Unknown future versions are a refuse-to-bind condition with a clear upgrade prompt.**

```json
{
  "schemaVersion": 1,
  "projectId": "01HXYZ...",
  "serverUrl": "https://relay.homelab.lan",
  "displayName": "relay (main worktree)"
}
```

1. **Required: `schemaVersion`.** Integer. The forward-compat signal — see rule 5 for the version-mismatch behavior. MVP value is `1`.
2. **Required: `projectId`.** String. The opaque server-issued identifier created when the project was registered. ULID or UUID at the implementation's discretion.
3. **Optional: `serverUrl`.** String. The full base URL of the Relay server that issued `projectId`. Useful when a user has multiple Relay servers paired in the same IDE (e.g., personal homelab plus work bastion). When absent, the extension falls back to whichever server it was configured against at first-run.
4. **Optional: `displayName`.** String. A human-readable label the extension uses in UI surfaces (status bar, quick-pick) when the server is unreachable for a live lookup. Otherwise the server's authoritative display name wins.
5. **Forward-compat: refuse to bind on unknown `schemaVersion`.** If the extension reads a `schemaVersion` higher than it recognizes, it does not bind, does not attempt graceful degradation, and surfaces a clear "this marker was written by a newer Relay extension; please update to bind" notification. Graceful degradation risks silent misinterpretation of fields the older client doesn't understand.
6. **Unrecognized fields at the current `schemaVersion`.** Ignored. A `schemaVersion: 1` reader that finds extra fields it doesn't know still binds.

**Why refuse-to-bind on unknown version (not graceful-bind-with-warning):** The marker is the *only* authoritative bind signal per [[d-g6-project-discovery--workspace-to-project-binding]]. Binding against an unknown schema means risking field-semantic drift (e.g., `projectId` becoming a structured object in v2). A hard refusal with a clear "upgrade your extension" prompt is unambiguous and short-lived — users update extensions on a normal cadence.

**Propagated to:** `prd/04-ide-extension.md` §4 (2026-05-15).

---

## ND-08: Skill subset enforcement mechanism

**Status:** open
**Affects:** `prd/09-persona-schema.md` §2, `docs/arch/persona-application.md` §5
**Surfaced by:** [[d-g1-persona-application-semantics]] resolution (specifically the implementation-pass arch doc `docs/arch/persona-application.md` §6.1 and §8, on 2026-05-15)

### Question
How does Relay enforce a persona's non-empty `skills:` list at session spawn, given that Claude Code currently exposes no CLI primitive to restrict the agent to a named subset of installed skills?

### Context
The persona-application mechanism in `docs/arch/persona-application.md` cleanly maps every other persona field to a CLI flag or transient `~/.relay/sessions/<sid>/` artifact: `systemPrompt` → `--append-system-prompt`, `model` → `--model`, `mcpServers` → filtered transient `mcp.json` + `--mcp-config --strict-mcp-config`, empty `skills:` → `--disable-slash-commands`. The non-empty `skills:` case is the only field without a clean enforcement path. Claude Code's available primitives are:

- `--disable-slash-commands` — all-or-nothing off switch.
- `--plugin-dir <path>` — additive, session-scoped; adds rather than restricts.
- `--add-dir`, `--allowedTools`, `--disallowedTools`, `--settings`, `--setting-sources` — operate on filesystem scope, built-in tools, or settings sources, not on the skill registry.

The persona schema in [[d-09-persona-yaml-schema]] commits to "populated list = exactly these skills, no others." Without a restriction primitive, that commitment is unenforced at the agent CLI boundary and reduces to a system-prompt narration ("you have access to: ..."), which an agent may or may not honor.

This entry tracks whether "advisory at MVP" is a permanent posture (acceptable for the self-host single-user threat model) or whether one of the real-enforcement options is worth picking up before Phase 1 ships.

### Options under consideration
- **Option A — Advisory at MVP.** Persona's `skills:` list is surfaced into the systemPrompt narration but the agent retains discovery of every skill under `~/.claude/skills/` and `<project>/.claude/skills/`. Zero implementation cost; the schema's strict-list semantics are documented as a soft constraint at MVP and the gap is recorded in `docs/arch/persona-application.md` §6.1. Honest about what's enforced; no false sense of restriction.
- **Option B — Transient curated skills directory + upstream `--skills-dir` flag.** Relay symlinks only the listed skill subdirectories into `~/.relay/sessions/<sid>/skills/` and points the agent at that dir via a `--skills-dir` flag that does not exist in Claude Code today and would need to be proposed upstream. Real enforcement; depends on an upstream change that may or may not land.
- **Option C — Plugin-dir composition.** Re-package each listed skill as a session-scoped plugin and load via `--plugin-dir`, paired with `--disable-slash-commands` to suppress the native registry. Works today, but requires every skill to be re-packaged as a plugin (or for a Relay-side adapter to wrap arbitrary skill dirs as plugins), and inverts the discovery model (full disable + explicit additive load) — fragile across Claude Code upgrades that may evolve the plugin/skill boundary.

### Current thinking
Option A at MVP, with the enforcement gap explicitly documented in `docs/arch/persona-application.md` §6.1. The self-host single-user threat model in `prd/00-overview.md` G-7 does not need skill restriction as a security boundary; users edit their own persona files and run their own agents. Re-evaluate if (1) persona authors surface friction (e.g., a persona that genuinely depends on a narrow skill set for behavioral consistency), or (2) a multi-tenant deployment surfaces and skills become a permission-boundary concern. Option B is the natural follow-up when an upstream flag exists.

### Resolution
*(unresolved)*

---

## ND-09: Bearer token hashing algorithm

**Status:** resolved (2026-05-17)
**Affects:** `prd/03-server.md` §6, `docs/threat-model.md` §4
**Surfaced by:** build-plan 6B preflight (2026-05-17) — `auth/hash.ts` needs a concrete algorithm before it can be written.

### Question
What algorithm does the `auth/` module use to hash bearer tokens at rest in `~/.relay/tokens.json`? [[d-13-first-run-pairing-ux]] commits to "hashed at rest" and `docs/threat-model.md` §4 restates it, but neither names the algorithm or salt scheme.

### Context
Tokens are 26-character Crockford-Base32 strings carrying ≥128 bits of cryptographically random entropy ([[d-13-first-run-pairing-ux]] §5). The hash exists to protect against a single failure mode: an attacker who reads `~/.relay/tokens.json` (e.g., via a backup leak, a stolen laptop, an over-permissive file mode) but who does not have the plaintext. With ≥128 bits of entropy in the input, the attacker cannot brute-force the preimage — a slow memory-hard KDF (`argon2id`, `scrypt`) earns nothing they wouldn't already be defended against by a fast cryptographic hash. Slow KDFs exist to defend low-entropy human-chosen passwords against offline grinding; that is not this threat.

The choice has real implementation cost. `argon2` and `bcrypt` are native dependencies that need a C toolchain on every install target (macOS, Linux, the Docker base image). Node's built-in `node:crypto` `createHash('sha256')` is part of the runtime, has no install footprint, and is the same primitive used to validate the token on every authenticated request — so the verification hot path stays microseconds, not milliseconds.

### Options under consideration
- **Option A — SHA-256 + 16-byte per-token random salt.** Each token row stores `{ saltB64, hashB64 }`; on verify, recompute `sha256(salt || plaintext)` and constant-time-compare. Zero native deps, fast on the verify path, cryptographically sufficient for ≥128-bit input. Salt prevents identical-token collisions across rows and across server installs.
- **Option B — `scrypt` via `node:crypto.scryptSync`.** Built-in (no native dep), memory-hard. Adds ~100 ms per verify call by default tuning — material on the WS upgrade path where verification gates every connection. Earns no security against the high-entropy threat model here.
- **Option C — `argon2id` via the `argon2` package.** Industry default for password hashing. Native compile required (binding.gyp); installation friction on every target. Same "no security gain over Option A for high-entropy input" trade.

### Resolution
**Option A: SHA-256 with a 16-byte per-token random salt, stored as `{ saltB64, hashB64 }` columns on the token record.** Verification rehashes `sha256(saltBytes || utf8(plaintext))` and constant-time-compares (`crypto.timingSafeEqual`) against the stored hash.

1. **Salt generation.** Each token gets a fresh 16-byte salt from `crypto.randomBytes(16)` at issue time. Salt is stored base64-encoded on the same record as the hash.
2. **Hash function.** `crypto.createHash('sha256').update(saltBytes).update(plaintext).digest()` → base64-encode → stored as `hashB64`. The hash is a fixed 32 bytes (43 base64 chars unpadded).
3. **Verify path.** `auth/verify(plaintext)` walks the active (non-revoked) token records, recomputes the salted hash per record, and `timingSafeEqual`s against the stored hash. Linear in active-token count, but bounded — operators typically hold <10 active tokens.
4. **No algorithm tag on records.** The token record schema does not carry an `algorithm: 'sha256-v1'` field at MVP. If a future migration changes the algorithm, the schema gains the field and the migration writes it on read.
5. **Implementation.** `auth/hash.ts` exposes two functions: `hashToken(plaintext) → { saltB64, hashB64 }` and `verifyTokenHash(plaintext, saltB64, hashB64) → boolean`. Both wrap `node:crypto` directly; no third-party dep.

**Why this and not Option B/C (`scrypt`, `argon2id`):** Slow memory-hard KDFs are the right answer for low-entropy human-chosen passwords because they raise the per-guess cost of an offline brute-force. With ≥128 bits of entropy in the input, the offline brute-force is already infeasible by the input space alone — adding KDF cost protects against a threat that doesn't exist here. The verification hot path runs on every authenticated REST call and every WS upgrade; a 100ms `scrypt` per request would be material. `argon2` additionally adds a native compile dependency to every install target, which conflicts with the "npm install runs cleanly on any Node 22 host" posture in `prd/06-distribution.md`.

**Why a per-token salt at all, given ≥128-bit input:** Salt is cheap (16 bytes per record) and defends two narrow but real scenarios — (1) two distinct Relay installs that, by astronomical chance, both issue the same plaintext token still produce different stored hashes, and (2) the hash output cannot be precomputed against a rainbow table of well-known token values (the table is empty today, but the discipline is free).

**Re-open trigger:** A future threat-model change that introduces low-entropy or human-chosen credentials (e.g., a Phase 4 admin password); or a token-format change that drops below 128 bits of entropy. Neither is on the roadmap.

**Propagated to:** `prd/03-server.md` §6 (2026-05-17), `docs/threat-model.md` §4 (2026-05-17).

---

## ND-10: `relay token list` subcommand surface alignment

**Status:** open
**Affects:** `prd/03-server.md` §7
**Surfaced by:** build-plan 6B preflight (2026-05-17) — the build-plan 6B row commits to four token subcommands (`init`, `create`, `revoke`, `list`) but `prd/03-server.md` §7 enumerates only `init`, `create`, `revoke`.

### Question
Should `relay token list` ship as part of the Phase 1 CLI surface, and if so, what is its exact output shape? `prd/03-server.md` §7 omits it; `docs/build-plan.md` task 6B includes it. The two specs disagree by one subcommand.

### Elaboration prompt
The build-plan is the newer artifact and explicitly canonicalizes the four-subcommand surface. The PRD §7 omission appears to be an oversight rather than a deliberate exclusion: a user who has issued multiple tokens via `relay token create --device <name>` has no way to enumerate them, which makes `relay token revoke <id>` unusable in practice (the operator can't recover the `<id>` of a token they want to kill — `~/.relay/last-pairing.txt` only shows the most recent issue). Treating `list` as in-scope for Phase 1 also keeps `relay session list` / `relay project list` / `relay persona list` symmetric across the noun surface.

What to validate before resolving: (a) the exact output columns (`{ id, deviceLabel, createdAt, revokedAt | "active" }` is the build-plan 6B proposal — confirm against operator UX expectations); (b) that `list` never prints the plaintext or the hash (threat-model §4 makes this load-bearing); (c) whether `--all` is needed to include revoked rows or whether they're listed by default (build-plan 6B does not specify; lean toward listing revoked by default since the list will be short and operators want to see "did my revoke actually land"); (d) the propagation edit to `prd/03-server.md` §7 — add the `relay token list` row between `relay token create --device <name>` and `relay token revoke <id>`.

This is filed as `open` so the resolution lands as a deliberate PRD edit rather than an inline implementation drift. Build-plan 6B ships `list` regardless (the build-plan is the canonical task surface for code that will be written); the PRD §7 propagation closes the doc gap.

---

## ND-11: `agentSessionId` capture mechanism

**Status:** resolved (2026-05-17)
**Affects:** `docs/arch/persona-application.md` §4.3 (new), `packages/server/src/session/agent-session-id.ts` (implementation), `packages/server/src/pty/CLAUDE.md` (correction), `docs/build-plan.md` task 6E (Reads list + Done-when)
**Surfaced by:** build-plan 6E preflight (2026-05-17) — Phase 0 report Surprise §6 explicitly assigned `agentSessionId` capture to 6E but left the discovery mechanism unspecified.

### Question
How does the `session/` orchestrator (6E) discover Claude Code's native session id after spawning the agent under PTY, given that Claude Code writes the id to `~/.claude/projects/<encodedCanonicalProjectPath>/<sessionId>.jsonl` rather than emitting it on stdout?

### Resolution
Filesystem-poll discovery with non-fatal timeout. The mechanism:

1. **Discovery mechanism.** Before spawn, the `session/` orchestrator snapshots the set of `.jsonl` filenames in `~/.claude/projects/<encodedPath>/`, where `encodedPath` is the project's canonical absolute path with every `/` replaced by `-` (including the leading `/`, which becomes the leading `-`). If the directory does not exist pre-spawn, the snapshot is the empty set.

2. **Polling loop.** After spawn, the orchestrator polls the directory every 250 ms for up to 30 s. The capture target is the first newly-appearing directory entry whose name matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$` (case-insensitive UUID v4 shape with `.jsonl` extension). The UUID stem (without the extension) is written to `sessions.agent_session_id` via the existing `updateAgentSessionId(db, id, ...)` repository function in [`packages/server/src/store/sessions.ts`](../packages/server/src/store/sessions.ts).

3. **Filter rule (both conditions required).** The entry must end in `.jsonl` AND its stem must be UUID-shaped. Claude Code creates three kinds of entries under the project dir: `<uuid>.jsonl` files (the capture target), bare-UUID directories with the same stem (sidecar storage), and a `memory/` directory. Filtering on `.jsonl` alone would let any future non-UUID `.jsonl` through; filtering on UUID-shape alone would match the bare sidecar directories. Empirically verified against a live `~/.claude/projects/` containing 12 project directories on 2026-05-17.

4. **Tunables.** `POLL_INTERVAL_MS = 250` and `CAPTURE_TIMEOUT_MS = 30_000` are named constants at the top of `packages/server/src/session/agent-session-id.ts` with a `Per ND-11` citation. Not server-config, not persona-overridable. Operators have no realistic reason to tune internal discovery cadence; if a real reason emerges (e.g., a slow filesystem layer surfaces in production), a follow-up ND can promote them to `~/.relay/config.yaml` alongside `claimLockTimeoutSeconds` (per ND-01).

5. **Failure mode.** Non-fatal. On timeout, `sessions.agent_session_id` stays `NULL`. When a client later attaches and the server builds the `hello` frame, the `agentSessionId` field is omitted entirely (no string, no null). Matches [`ws-protocol.md`](arch/ws-protocol.md) §2.3 "optional" wording without a wire-schema change. The IDE extension already has to handle the absent case (the agent may simply never write a `.jsonl` — e.g., during a future non-Claude agent integration).

6. **Why not Option B (`fs.watch`).** Platform-specific failure surface on macOS APFS, where `rename` events are documented to be missed under specific timing patterns; the latency win (sub-100ms vs ~250ms) does not justify the testing burden for a one-shot discovery on session spawn. Polling at 250 ms means worst-case 120 `readdir` calls per spawn — bounded and cheap.

7. **Why not Option C (parse stdout).** Claude Code does not emit its session id to stdout or stderr. Rejected on read of actual agent behavior.

**Path-encoding edge case.** The empirical sample used during resolution did not contain a canonical project path with a space character. The implementation should pass spaces through textually (Claude Code's convention appears to be pure `/` → `-` replacement with no other escaping) and ship a unit test against a fixture path containing a space; if the agent's actual behavior diverges, file an ND.

**Why this and not a wire-schema discriminator.** Adding an `agentSessionIdStatus: 'pending' | 'captured' | 'unavailable'` field to `hello` would let the IDE extension show a distinct "correlation unavailable" affordance, but: (i) under Option A the capture is synchronous before `hello` fires, so the `pending` state is a lie; (ii) the absent field already conveys "unavailable" — the extension can branch on `frame.agentSessionId !== undefined`; (iii) adding wire surface for a Phase-2 affordance is premature. If the extension later needs to distinguish "agent has no concept of session id" from "Relay gave up trying," a follow-up ND can extend the frame.

**Propagated to:** `packages/server/src/pty/CLAUDE.md` (2026-05-17), `docs/arch/persona-application.md` §4.3 (2026-05-17), `docs/build-plan.md` task 6E (2026-05-17).

---

## ND-12: `spawn.json` schema location

**Status:** resolved (2026-05-17)
**Affects:** `docs/arch/persona-application.md` §4.2, [`packages/protocol/src/spawn-record.ts`](../packages/protocol/src/spawn-record.ts), `packages/server/src/session/spawn.ts` (6E)
**Surfaced by:** build-plan 6E preflight (2026-05-17) — `docs/arch/persona-application.md` §4.2 names `spawn.json` as part of the transient session dir at `~/.relay/sessions/<sid>/` but gives no formal schema.

### Question
What is the formal schema for the `spawn.json` audit file written into `~/.relay/sessions/<sid>/` at session spawn, and where does the Zod definition live so 6E (writer) and the future `relay session inspect` (6H, reader) share a single source of truth?

### Elaboration prompt
[`docs/arch/persona-application.md`](arch/persona-application.md) §4.2 prose names `spawn.json` and describes its purpose ("records the resolved persona snapshot, argv, env names (not values), timestamps") but does not commit to field names, types, or schema-version handling. Without a formal schema, 6E will inline an ad-hoc object literal and 6H will reverse-engineer it later — the precise drift the `@relay/protocol` package exists to prevent (see [`docs/arch/repo-layout.md`](arch/repo-layout.md) §3 on the protocol package's role).

Two location options:

- **Option A — Define in `@relay/protocol` as a shared Zod schema.** New file `packages/protocol/src/spawn-record.ts` exports `SpawnRecordSchema` (Zod) and `type SpawnRecord = z.infer<typeof SpawnRecordSchema>`. 6E imports and validates writes; 6H imports and validates reads. Single source of truth; future-proof against the schema evolving (a `schemaVersion: number` field at the top discriminates readers).
- **Option B — Define inline in `session/spawn.ts` as a local TypeScript type.** Lower ceremony, but creates the drift the protocol package was designed to prevent the moment 6H lands and writes its own reader.

Proposed schema (Option A):

```ts
const SpawnRecordSchema = z.object({
  schemaVersion: z.literal(1),
  sessionId: z.string(),                              // ULID
  projectId: z.string(),                              // ULID
  personaName: z.string(),                            // kebab-case
  personaSource: z.enum(['tenant', 'project']),       // which dir the persona was loaded from
  argv: z.array(z.string()),                          // the resolved CLI argv passed to node-pty
  envNames: z.array(z.string()),                      // env var NAMES only — values are secrets per persona-application.md §4.2
  cwd: z.string(),                                    // canonical project path (per D-12)
  agentCli: z.string(),                               // e.g. 'claude'
  spawnedAt: z.string().datetime(),                   // ISO-8601 UTC
});
```

What to validate before resolving: (a) whether `personaFilePath` and the persona's content hash should be captured alongside `personaName` so a forensic reader can prove which exact file resolved (useful when the same persona name resolved differently across tenant vs project dirs); (b) whether `mcpJsonPath` (when a transient `mcp.json` is written) gets a sibling field for cross-file audit; (c) whether the `0o600` file mode on `spawn.json` matches the threat-model boundary for the transient session dir (mode `0o700` on the dir is proposed in the build-plan, this aligns).

### Resolution

**Option A.** `SpawnRecordSchema` lives in `@relay/protocol` at [`packages/protocol/src/spawn-record.ts`](../packages/protocol/src/spawn-record.ts). 6E imports it to validate writes; the future `relay session inspect` reader (deferred past 6H) imports it to validate reads. Matches the `PersonaSchema` precedent (single source of truth for a wire/disk shape, `.strict()`, top-of-file citation comment). `schemaVersion: z.literal(1)` discriminates readers if the shape ever evolves.

Sub-question answers:

- **(a) `personaFilePath` + `personaContentHash`: both included.** `PersonaInput.filePath` is already exposed by the persona loader (`packages/server/src/persona/types.ts`), so `personaFilePath` is zero-cost. `personaContentHash` is `sha256:<hex>` over the YAML bytes at spawn — proves which exact bytes resolved even if the file is later edited. 6E computes it via `crypto.createHash('sha256').update(yamlBytes).digest('hex')` from the bytes read at `personaFilePath`.
- **(b) `mcpJsonPath`: included as `z.string().nullable()`.** `null` when the persona has no `mcpServers` filter (no `mcp.json` written, per §4.2); absolute path when written.
- **(c) `0o600` on `spawn.json`: yes.** Aligns with the proposed `0o700` on the transient session dir and matches the existing transcript-sidecar pattern in 6D (`packages/server/src/transcript/writer.ts`). Owner-only readable; treats spawn metadata as private to the host user. Behavioral constraint on the 6E writer — recorded here rather than in the schema.

---

## ND-13: Byte-accounting cadence for `sessions.total_bytes`

**Status:** open
**Affects:** `packages/server/src/session/byte-accounting.ts` (new), `packages/server/src/store/CLAUDE.md` (consistency note)
**Surfaced by:** build-plan 6E preflight (2026-05-17) — 6E wires `pty.onBytes` to `transcript.writer.append`, and must also keep `sessions.total_bytes` reasonably accurate for [[nd-04-transcript-pagination-api-shape]]'s `before`-cursor semantics. The flush cadence has cost vs. accuracy trade-offs that should be resolved deliberately.

### Question
When does the `session/` orchestrator call `sessions.incrementTotalBytes(db, sid, delta, now)` to update the `sessions.total_bytes` column — on every PTY byte event (correct but expensive), batched on a timer (lossy on hard crash), or only on `pty.onExit` / `registry.shutdown()` (very lossy but simplest)?

### Elaboration prompt
[[nd-04-transcript-pagination-api-shape]] commits to a `before`-cursor over byte offsets where `totalBytes` is the canonical upper bound the server presents to clients. The transcript sidecar file is the ground truth for which bytes exist on disk (per [`docs/arch/sqlite-schema.md`](arch/sqlite-schema.md) §3); the `total_bytes` column is a denormalized read accelerator that lets `GET /transcript` answer without `fstat`-ing the sidecar on every paginated read.

Three options:

- **Option A — Per-chunk synchronous flush.** Every `pty.onBytes` event calls `incrementTotalBytes`. Accurate to the byte, but at terminal output rates (a `make` invocation can emit thousands of small chunks/sec), this is one SQL UPDATE per chunk — measurable IO load on a host with multiple live sessions. Correctness wins, perf loses.
- **Option B — Batched 1-second flush with shutdown drain.** In-memory pending counter per session; a `setInterval(flush, 1000)` SQL-UPDATEs only sessions with non-zero pending deltas. `registry.shutdown()` and `pty.onExit` both flush synchronously. Lossy by ≤1 s on hard crash (kill -9, power loss) — but the sidecar file is the disaster-recovery source of truth and 6F's transcript pagination can fall back to `fstat()` on the sidecar when `total_bytes` is suspected stale (e.g., on first read after a `running` row's recent boot-sweep transition). Cost: one SQL UPDATE per active session per second, dominated by the rate of inactive sessions (which contribute zero updates). Lean.
- **Option C — Flush only on `pty.onExit` and `registry.shutdown()`.** Zero overhead during the session's lifetime. `total_bytes` reports `0` until the agent exits — `GET /transcript` paginated reads must fall back to `fstat()` on every call for live sessions. Simplest code; pushes complexity into the read path.

What to validate before resolving: (a) whether the 1-second cadence is the right tunable, or whether it should scale with session count (e.g., 100ms when one session, 5s when ten); (b) whether the lossiness on hard crash is acceptable given that the next boot's [[d-11-server-restart-and-session-orphaning]] sweep flips the row to `killed/server_restart` and the `total_bytes` lag becomes user-visible only via `GET /transcript` cursor edge cases (the sidecar `fstat()` fallback covers this); (c) whether the byte-accounting module should also expose a `force-flush` hook for tests and operator commands; (d) whether 6F needs a `transcript/CLAUDE.md` note that `total_bytes` is eventually consistent within the cadence window.

Proposed direction is Option B (1-second batched flush + shutdown drain) with a consistency note added to `packages/server/src/store/CLAUDE.md` so 6F's transcript pagination code is aware of the freshness boundary. Code that touches `packages/server/src/session/byte-accounting.ts` and the consumer in `session/registry.ts` is blocked on this resolution.

