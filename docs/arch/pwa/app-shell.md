# Relay Arch — PWA App Shell

**Status:** v0.1 (in progress, 2026-06-02)
**Scope:** L2 of [`README.md`](README.md) §3 — framework, build / toolchain, routing & navigation,
soft-keyboard-aware shell layout, PWA infrastructure (manifest, service worker, installability,
offline posture), and the PWA package layout in the monorepo.
**Out of scope:** Design-system content (L1 — [`foundations.md`](foundations.md), delivery-pending).
Data / connection layer (L3 — [`data-layer.md`](data-layer.md)). UI module decomposition (L4 —
[`feature-modules.md`](feature-modules.md)).

---

## 1. Decision — framework

**Angular.** Current stable at this entry is **Angular 21.2.15** (Angular 21 LTS through
2027-05). **Angular 22** was scheduled for the week of 2026-06-01 (effectively now); the initial
pin is `^21`, with v22 a likely fast-follow once released and the ecosystem (signal-forms,
libraries) stabilises (see §4).

**Cites.** [[d-18-pwa-terminal-substrate-and-mvp-scope]] §7 (framework choice deferred to the
tech-arch phase); NFR-5 (Angular is client-internal; no server impact).

**Clean-slate, not spike inertia.** The decision rests on the modern Angular era (§2), not on the
Track 9 spike. The spike is feasibility-only and contributes nothing to this build (per the
clean-slate guardrail).

## 2. Angular era this PWA targets

The PWA is built against the era of Angular characterised by:

- **Standalone-by-default** (since v19) — no NgModule scaffolding.
- **Signals as stable reactivity primitives** (since v20) — `signal`, `computed`, `effect`,
  `linkedSignal`, signal inputs / queries; signal-based forms (experimental v21, stable in v22).
- **Zoneless change detection is the default** (since v21) — no Zone.js by default.
- **Vitest replaces Karma** as the test runner (since v21).

These define the surface L3 (connection layer) and L4 (feature modules) are designed against —
signal-driven state, standalone-component composition, zoneless reactivity.

## 3. L2 sub-topics — status

Within Angular, the build / test / PWA-infra rows below were batched as **accept Angular's
documented defaults** (user decision, 2026-06-02). The genuinely open sub-topics — routing
shape, soft-keyboard-aware shell composition, monorepo package layout — are walked
individually in subsequent questions.

| Sub-topic                                 | Status                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Framework                                 | **Angular** (§1).                                                                                                   |
| Build / toolchain                         | **Accept Angular default:** CLI esbuild application builder.                                                        |
| Test runner                               | **Accept Angular default:** Vitest.                                                                                 |
| Tailwind integration                      | Angular documents two paths: `ng add tailwindcss`, or manual `@tailwindcss/postcss` + `.postcssrc.json`. Pick on design-system delivery (L1 §6). |
| PWA infra (manifest + SW)                 | **Accept Angular default:** `@angular/pwa` + `@angular/service-worker`, configured via `ngsw-config.json`.          |
| Routing / navigation                      | **Hybrid navigation model** (§4): full routes for durable views; sheets for transient flows; direct actions where a tap should just do the thing. Sub-decisions resolved in §4.3–§4.5. |
| Soft-keyboard-aware shell layout          | **Hybrid CSS-base + JS-during-keyboard** (§5): `dvh`/`svh` viewport units for the resting layout, `visualViewport` API driving layout only while the compose buffer is focused. |
| Monorepo package layout (`packages/pwa/`) | **Accept Angular CLI standard application schema** for boilerplate (§6); two open sub-decisions: `src/` organization style (§6.1), monorepo path aliases (§6.2). |
| Offline posture                           | **None for MVP** (NFR-7) — the PWA is a live view; the service worker is for installability + first-load caching only, not offline session use. Settled. |

## 4. Routing & navigation

**Decision — navigation model: hybrid** (user, 2026-06-02). Full-page routes for durable,
deep-linkable views; sheets / overlays for transient flows; pure action (no UI surface) when a tap
should just *do the thing* and navigate. The per-view mapping below applies the principle "use the
appropriate model where it makes sense."

### 4.1 Per-view mapping

| View                                | Model                              | Rationale                                                                                                                                                                |
| ----------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pair / auth (FR-1)                  | **Full route** `/pair`             | First-run gate; deep-linkable from the `relay://pair?...` snippet per [[d-13-first-run-pairing-ux]]; must be addressable for the QR / link flow.                          |
| Home — sessions list (FR-2)         | **Full route** `/`                 | Entry view; default landing after auth; deep-linkable.                                                                                                                   |
| Live-session (FR-4)                 | **Full route** `/sessions/:id`     | Durable, deep-linkable (paste link → attach), refresh-survivable per FR-14 (fire-and-forget). The centerpiece view.                                                       |
| Spawn against a project (FR-8)      | **Sheet** over home                | Transient picker (project → confirm) that ends by navigating to `/sessions/:id`. No permanent address worth a URL.                                                       |
| Scratch spawn (FR-9)                | **Direct action** (no UI surface)  | Per [`interaction-model.md`](../../design/pwa/interaction-model.md) §3: one tap → server `mkdir`s `~/.relay/scratch/<id>/` + spawns → navigate to `/sessions/:id`. No intermediate sheet or route. |
| Create-project from client (FR-10)  | **Sheet** over home                | Transient form (path-or-`mkdir` + register) returning to an updated home.                                                                                                |
| File viewer (FR-13, conditional)    | **Inline panel** inside live-session — viewport-adaptive (§4.3) | Always within `/sessions/:id`; not a separate URL, not a sheet. User-stated UX intent (2026-06-02): "used often, should not be a hard navigation."                          |

### 4.2 Routing sub-decisions — status

All resolved. See §4.3 file-viewer presentation, §4.4 route-loading strategy, §4.5 auth-guard
placement.

### 4.3 File-viewer presentation — viewport-adaptive

**Decision (user, 2026-06-02).** The file viewer is an **inline panel inside the live-session
view**, NOT a sheet and NOT a sub-route. Presentation adapts to viewport:

- **Desktop:** the file viewer is *part of the view* — visible alongside the terminal in a
  split-pane layout.
- **Mobile:** terminal and file viewer are **peer panels** inside `/sessions/:id`, switched via a
  soft toggle (tab strip / segmented control / similar) — frequent, single-tap, never a
  back-button navigation. The specific toggle UI primitive follows from the design-system
  delivery (L1).

**Implications.**

- L4 live-session decomposition gains a **file-panel** sub-module peer to the terminal viewport,
  control rail, and compose buffer. The live-session shell composes them based on viewport.
- L2 §5 (shell layout — pending) must account for the viewport-adaptive split / toggle.
- NFR-6 (primary device = phone) still holds; this decision adds a desktop responsive treatment
  without changing mobile-first UX.

**Open.**

- **Specific mobile toggle UI primitive** (tab strip, segmented control, swipe gesture) — picks
  up on L1 design-system delivery.
- **Desktop responsive thresholds** — breakpoint at which the split-pane appears. Pending.

**Cites.** FR-13; [`interaction-model.md`](../../design/pwa/interaction-model.md) §4 (file viewer
is a separable module that can drop to fast-follow); NFR-6 (mobile-primary).

### 4.4 Route-loading strategy

**Decision (user, 2026-06-02): eager loading** for all routes (`/pair`, `/`, `/sessions/:id`).
Route components are imported directly in the routes array; no `loadComponent` dynamic-import
splits.

**Rationale.** With ~3 routes and an installed-PWA posture, the apparent "lazy = faster first
paint" win applies only to the very first visit (before the service worker installs); from the
SW's second activation onward, eager and lazy are functionally equivalent for cold-open speed
because the SW pre-caches everything either way. Lazy's permanent costs — `ChunkLoadError` as a
runtime failure class, larger `ngsw-config.json` `assetGroups` surface, harder cache-invalidation
reasoning across SW updates, partial-update windows during a session — outweigh a one-time
first-visit benefit on a small route surface used over LAN / Tailscale.

**Revisit if.** `/sessions/:id` grows substantially (e.g. heavy in-session tools well beyond the
file panel), or the PWA gains routes that are rarely visited by the typical user. Recorded in §5.

**Cites.** NFR-1 (latency — input/echo, not first-paint); NFR-2 (reliability — avoid runtime
chunk-load failure class).

### 4.5 Auth-guard placement

**Decision (user, 2026-06-02): single `pairStatus` guard** gating every route except `/pair`. Any
unauthenticated navigation is bounced to `/pair`. "For now" — revisit if the route surface grows
to include views that should be reachable without a bearer (e.g. an `/about` or `/diagnostics`
that doesn't talk to the server).

**Cites.** FR-1 (pair / auth); NFR-4 (bearer-token auth on all REST + WS); NFR-5 (no PWA-specific
coupling — guard is purely client-side state).

## 5. Shell layout (soft-keyboard-aware)

**Decision (user, 2026-06-02): hybrid CSS base + JS during keyboard** (Option 3 of the §5
approaches). `dvh` / `svh` viewport units express the resting layout; the `visualViewport` API
drives the layout only while the compose buffer has focus (keyboard up). JS attaches its
listeners on `focusin` and detaches on `focusout`, keeping the daily code path JS-free.

### 5.1 Composition

The live-session view composes (top → bottom on mobile; rail + compose pinned to bottom on
desktop):

- **Header** — session id + status (FR-2, FR-11).
- **Primary area** — terminal viewport (xterm.js) **and** file panel (FR-13), arranged per §4.3
  (desktop split-pane; mobile soft toggle between peer panels).
- **Control rail** (FR-5) — in normal flow, **not `position: fixed`**, so the keyboard handling
  uniformly applies to the bottom strip.
- **Compose buffer** (FR-6) — last in flow; gains focus → triggers JS-driven keyboard mode.

### 5.2 Keyboard handling

**Resting (no keyboard).** Layout fills `100dvh`; the primary area flexes. No JS.

**Keyboard up (compose focused).**

1. A `focusin` listener on the compose attaches `visualViewport.resize` + `visualViewport.scroll`
   handlers.
2. The handler writes the visible-viewport delta into a CSS custom property (e.g.
   `--keyboard-inset`), `requestAnimationFrame`-throttled.
3. The shell consumes the property to shrink the **primary area** (terminal + file panel
   container) so the rail + compose stay anchored above the keyboard.
4. The terminal's `fit-addon` re-fits on container resize → a WS `resize` frame is sent per
   [[nd-23-pty-size-negotiation-and-sigwinch-forwarding-for-attach-clients]].
5. `focusout` detaches the listeners and clears `--keyboard-inset` → resting layout restored.

### 5.3 Cross-cutting notes

- **xterm `fit-addon` must be cheap to call repeatedly.** Frequent re-fits during keyboard
  animation are expected.
- **Track `interactive-widget=resizes-content` viewport-meta support.** If iOS Safari ships it in
  a future release, the JS path can be simplified or retired. Recorded in §7.
- **Desktop layout** doesn't exercise the keyboard path (physical keyboard, no overlay). The CSS
  base is sufficient there.
- **PWA standalone vs in-browser** changes some viewport behavior on iOS; allocate a dedicated
  test pass during implementation.

**Cites.** NFR-1 (latency — keep handlers cheap); NFR-6 (iOS Safari quirks); NFR-8 (rail +
compose visible above keyboard);
[[nd-23-pty-size-negotiation-and-sigwinch-forwarding-for-attach-clients]] (resize → WS frame).

## 6. Package layout (`packages/pwa/`)

**Decision (user, 2026-06-02): accept Angular CLI's standard application schema** for the
boilerplate, with two sub-decisions held open for explicit discussion: `src/` organization
style (§6.1) and monorepo path aliases (§6.2).

### Batched defaults

- Standard Angular CLI application schema (generated via `ng new` or `ng generate application`
  inside the monorepo).
- `src/app/` for application code; `src/assets/` (or `public/` per the modern CLI default —
  confirm against the CLI version used at scaffold time) for static assets; `src/index.html`,
  `src/main.ts`, `src/styles.{css|scss}` per CLI default.
- Root config files: `angular.json`, `tsconfig.json` + `tsconfig.app.json` + `tsconfig.spec.json`,
  `package.json`.
- `ngsw-config.json` at the PWA package root (generated by `ng add @angular/pwa`).
- Tailwind config at the PWA package root — specific filename / format decided on design-system
  delivery (L1 §6).
- Co-located `*.spec.ts` files per the Angular + Vitest convention (since v21).

### 6.1 `src/` organization style

**Decision (user, 2026-06-02): Angular default layer-first.** Top-level `src/app/components/`,
`src/app/services/`, `src/app/guards/`, `src/app/pipes/` (and `directives/` if needed) — code
organised by *kind*, not by feature. Filenames carry the feature identity (e.g.
`components/live-session.component.ts`, `services/ws-client.service.ts`).

**Cites.** L2 §1 (Angular framework); NFR-5 (client-internal organisation).

### 6.2 Monorepo path aliases

**Decision (user, 2026-06-02): pnpm workspace deps only.** `@relay/protocol` (and any future
shared package) is referenced via a workspace dependency in the PWA's `package.json`; pnpm
provides the symlink resolution. No internal PWA path aliases — relative imports within the
package per the Angular CLI default.

Matches the existing monorepo pattern: `packages/server` consumes `@relay/protocol` this way
(see [`../repo-layout.md`](../repo-layout.md)).

**Cites.** [`../repo-layout.md`](../repo-layout.md); NFR-5 (no PWA-specific monorepo divergence).

## 7. Loose ends

- **Angular 22 cutover.** v22 was scheduled for the week of 2026-06-01. Pin v21 initially; revisit
  v22 once released and ecosystem libraries (signal-forms, signal-aware router pieces, third-party
  components) catch up.
- **Tailwind v4 + service-worker file-watcher loop.** A documented infinite compile loop can hit
  when SW autogen writes into `public/` and Tailwind v4 rescans those files. Mitigation pattern:
  gitignore the autogenerated PWA files (e.g. `public/*.js`). Carry forward into the implementation
  plan.
- **D-NN candidate.** The §1 framework decision is worth a `decision-log` entry alongside the L1
  source-of-truth entry. Offered at session end.
- **Desktop as a first-class target.** The §4.3 viewport-adaptive decision implicitly broadens the
  PWA to desktop responsive treatment, while [`docs/design/pwa/`](../../design/pwa/) and NFR-6 are
  mobile-focused. If desktop becomes a first-class UX target (not just responsive parity), a
  back-pass through `docs/design/pwa/` (and possibly [[d-18-pwa-terminal-substrate-and-mvp-scope]])
  is warranted. Flagged here; not resolved.
- **D-NN candidate — viewport-adaptive file-viewer presentation (§4.3).** Worth its own
  `decision-log` entry so L4 / L1 work can cite it. Offered at session end.
- **Revisit eager loading if** `/sessions/:id` grows substantially or new rarely-visited routes
  appear (§4.4). Today, eager is the right call for a 3-route installed PWA.
- **Track `interactive-widget=resizes-content` viewport-meta support on iOS Safari.** If/when it
  ships, the §5.2 JS path can simplify or retire. Re-check on each iOS release during
  implementation.
- **iOS PWA standalone-mode viewport test pass.** §5.3 noted; allocate explicitly during
  implementation.
