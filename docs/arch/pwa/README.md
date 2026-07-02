# Relay Arch — PWA UI Client

**Status:** v0.1 (in progress, 2026-06-02)
**Scope:** UI-client architecture for the Relay PWA — design-system foundations, app shell + PWA
infrastructure, connection + state layer, UI module decomposition, client-side cross-cutting
concerns, and a running log of server-side couplings this client needs (recorded as unresolved
dependencies, not resolved here). This doc set opens the tech-architecture phase that
[[d-18-pwa-terminal-substrate-and-mvp-scope]] §7 and `~/.claude/plans/we-ve-done-quite-a-keen-corbato.md` §8
deferred under the user's product → design → tech ordering.

**Out of scope:** Product/UX, which is authoritative at [`docs/design/pwa/`](../../design/pwa/).
Server-side resolution of any coupling this client surfaces — those land in
[`unresolved-dependencies.md`](unresolved-dependencies.md) for a later server-side pass.
Implementation plan or code — a separate `writing-plans` cycle, only on request. Anything about
`packages/spike-pwa/` (feasibility-only, not a baseline).

---

## 1. Purpose & framing

The PWA is the user's **opinionated mobile/web client** over the same REST/WS contract the IDE
extension and `relay attach` consume — that contract is documented in
[`../ws-protocol.md`](../ws-protocol.md), [`../rest-conventions.md`](../rest-conventions.md), and
the audit in [`../client-agnosticism.md`](../client-agnosticism.md). The terminal-style substrate
(xterm.js) and the MVP product scope are resolved at [[d-18-pwa-terminal-substrate-and-mvp-scope]];
the elaborated FR/NFR, IA, and live-session flows live at [`docs/design/pwa/`](../../design/pwa/).

This architecture doc set sits at the **boundary between that resolved product/UX and the eventual
code.** It records the user's UI-client architectural decisions — design-system, app shell, data
layer, feature modules, cross-cutting concerns — citing the FR/NFR or D-NN/ND-NN each decision
traces to. The implementation plan and code are deliberately separate steps that follow this doc
set on request.

## 2. Boundaries

### 2.1 Client only

Every decision recorded here is a **client-side** decision. The PWA is one of three first-party
clients (`relay attach`, IDE extension, this PWA) and **must not regress the other two**
(NFR-5 in [`requirements.md`](../../design/pwa/requirements.md)). When a topic surfaces that needs
server/backend coupling — a protocol change, a REST shape, a new server-derived field — it is
recorded in [`unresolved-dependencies.md`](unresolved-dependencies.md) as a candidate ND and left
for a later server-side pass.

### 2.2 Product/UX vs system architecture

Per [[d-18-pwa-terminal-substrate-and-mvp-scope]] §6:

- **`docs/design/pwa/`** owns product, UX, interaction design — *what the user sees and does*.
- **`docs/arch/pwa/`** (here) owns system architecture — *how the client is composed, what its
  modules are, what they depend on*.

The design docs are inputs to this doc set; nothing here changes them. If a UX detail needs
revision, it goes back through `docs/design/pwa/` (and possibly D-18) — not invented here.

### 2.3 Client-agnosticism contract

The server is and stays client-agnostic (NFR-5; [`../client-agnosticism.md`](../client-agnosticism.md)).
The PWA consumes the canonical REST/WS contract — it does NOT have a privileged path. Any additive
server touch point the PWA needs is filed as a candidate ND in
[`unresolved-dependencies.md`](unresolved-dependencies.md) for separate resolution; it is not
unilateral.

## 3. Layer map

This doc set decomposes the UI client into seven layers, each with its own doc. Layers are read
top-down: foundations and shell settle first so feature modules decompose against a known platform;
server couplings and cross-cutting concerns are harvested continuously and consolidated at L5/L6.

- **L0 — Overview & boundaries** (this doc).
- **L1 — Foundations / design system.** Design tokens, theming, typography, spacing, a11y
  primitives, component primitives, iconography. → [`foundations.md`](foundations.md).
- **L2 — App shell / platform.** Framework, build tooling, routing/navigation, soft-keyboard-aware
  shell layout, PWA infrastructure (manifest, service worker, installability, offline posture).
  → [`app-shell.md`](app-shell.md).
- **L3 — Data / connection layer.** WS client + reconnect, REST client, client state model,
  auth/token storage. → [`data-layer.md`](data-layer.md).
- **L4 — Feature modules (UI decomposition).** Pair/auth; sessions home; live-session (terminal
  viewport · control rail · compose buffer · raw toggle · header/controls · BUSY); spawn /
  scratch / create-project; file viewer; status & error UX; dictation.
  → [`feature-modules.md`](feature-modules.md).
- **L5 — Server contract / unresolved dependencies.** Server couplings this client needs, each as
  a candidate ND for later server-side resolution.
  → [`unresolved-dependencies.md`](unresolved-dependencies.md).
- **L6 — Cross-cutting concerns.** Latency, reliability, security, a11y / ergonomics,
  observability, iOS Safari PWA quirks, offline posture, disposability / migration.
  → [`cross-cutting.md`](cross-cutting.md).

## 4. Authored inputs

Every decision in this doc set traces to an authored requirement or a resolved decision; this is
the canonical reading list:

- [`docs/design/pwa/requirements.md`](../../design/pwa/requirements.md) — FR-1…FR-14, NFR-1…NFR-10.
- [`docs/design/pwa/interaction-model.md`](../../design/pwa/interaction-model.md) — IA, live-session
  screen, spawn / scratch flows, file viewer, status awareness, designed-around consequences.
- [`docs/design/pwa/server-touchpoints.md`](../../design/pwa/server-touchpoints.md) — initial
  additive touch points (seed for [`unresolved-dependencies.md`](unresolved-dependencies.md)).
- [[d-18-pwa-terminal-substrate-and-mvp-scope]] — substrate + scope + doc taxonomy (§6) + tech
  defer (§7).
- [`../client-agnosticism.md`](../client-agnosticism.md), [`../ws-protocol.md`](../ws-protocol.md),
  [`../rest-conventions.md`](../rest-conventions.md) — the canonical client contract.

## 5. Convention

Every recorded decision cites the FR/NFR or D-NN/ND-NN it traces to. A new decision worth a
citation is filed via the `decision-log` skill before being cited from code. Server-coupling
decisions are never resolved in this doc set — they are recorded in
[`unresolved-dependencies.md`](unresolved-dependencies.md) as candidate NDs for a later
server-side pass.
