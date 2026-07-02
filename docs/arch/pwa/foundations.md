# Relay Arch — PWA Foundations

**Status:** v0.1 (delivery-pending, 2026-06-02) — design-system delivery is external and not yet
in hand; this doc records the source-of-truth decision and the integration seam, with all L1
sub-topics deferred to delivery.
**Scope:** L1 of [`README.md`](README.md) §3 — design tokens, theming, typography, spacing, a11y
primitives, component primitives, iconography. The PWA's design-system source of truth, the build
seam that consumes it, and the per-sub-topic deferral list.
**Out of scope:** Authoring of the design system itself (external — see §2). Build framework and
tooling (L2 — [`app-shell.md`](app-shell.md)). Anything about `packages/spike-pwa/`.

---

## 1. Purpose

Settle where design-system content (tokens, theming, typography, spacing, a11y primitives,
component primitives, iconography) comes from, how it lands in the PWA build, and what the
architecture must do today so the eventual delivery wires in cleanly when it arrives.

## 2. Decision — design-system source of truth

The PWA's design system is **authored externally in Claude Design** by the user and delivered as
a **Tailwind-CSS-compatible scheme**. The PWA does NOT author, redefine, or shadow design-system
content; it **consumes** the delivered scheme.

**Cites.** NFR-8 (ergonomics / a11y); [[d-18-pwa-terminal-substrate-and-mvp-scope]] §7
(foundations deferred to the tech-architecture phase). Worth promoting to a D-NN for traceability
— see §7.

## 3. Tailwind in the PWA build

**Tailwind CSS is in the PWA's build** as the consumption mechanism for the delivered scheme.
The exact major / minor is pinned to whatever the delivery targets; the current stable at the
time of this entry is **Tailwind CSS 4.3.0** (released 2026-05-08), and Tailwind v4 introduces a
CSS-first configuration model (no required JS config). The L2 framework + build choice
([`app-shell.md`](app-shell.md)) must keep Tailwind v4-class tooling viable; that constraint flows
into L2.

**Open until delivery.** The exact Tailwind major / minor the scheme targets, and whether it uses
the v4 CSS-first config or carries a JS config for v3-class workflows. Recorded in §7.

## 4. Sub-topics — all deferred to design-system delivery

Each L1 sub-topic is prescribed by the external design system. The architecture's job today is to
*not pre-fill* and to *not invent defaults* the delivery will overwrite.

| Sub-topic            | Status on delivery                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------- |
| Design tokens        | Defined by the delivered Tailwind theme / scheme.                                             |
| Theming              | Defined by the delivered scheme (including the terminal palette).                             |
| Typography           | UI + monospace terminal font prescribed by delivery (NFR-8).                                  |
| Spacing / layout     | Spacing scale and layout primitives prescribed by delivery.                                   |
| A11y primitives      | Tap-target sizing, focus rings, contrast prescribed by delivery (NFR-8). To verify on delivery. |
| Component primitives | Prescribed by delivery; consumer code (L4) uses them, does not redefine them.                 |
| Iconography          | Prescribed by delivery (an icon set or a pointer to one).                                     |

Until delivery, the PWA does not author or pin any of the above. Any pre-delivery scaffolding that
needs *something* to compile uses a deliberately **empty placeholder Tailwind config**, swapped on
delivery.

## 5. Architectural guarantees the PWA must hold

Regardless of when delivery lands, the PWA's architecture must guarantee:

1. **No duplicate source of truth.** Tokens, color values, spacing scales, type ramps, etc. live
   only in the delivered Tailwind scheme — never copied into PWA code or component definitions.
2. **Consumers use the scheme.** L4 component primitives style via Tailwind utility classes /
   token references prescribed by the delivery — they do not hand-roll values.
3. **Swap is a config swap.** Replacing the placeholder config with the delivered one (and any
   font / CSS assets it ships) is the entire integration footprint — no widespread component
   rewrites.
4. **A11y is not lost in the swap.** NFR-8 tap-target sizing, focus, and contrast must be
   satisfied by the delivered scheme; any missing piece is filed against the design source or in
   [`unresolved-dependencies.md`](unresolved-dependencies.md) §2 on delivery — never silently
   patched in PWA code.

## 6. Retrieval & integration on delivery

This section is the canonical re-entry point on delivery. When the design-system delivery is in
hand:

- **Where files land — confirm on delivery.** Two natural candidates: design artifacts (token JSON,
  Figma exports, screenshots, reference material) under `docs/design/pwa/design-system/` —
  consistent with the `docs/design/` tree; build inputs (Tailwind config, CSS, fonts) inside the
  PWA package once L2 fixes its layout (likely under `packages/pwa/`). The user picks the final
  paths at delivery.
- **Integration steps.**
  1. Read the delivered scheme; pin the PWA's Tailwind major / minor to what it targets.
  2. Replace any placeholder Tailwind config with the delivered one and wire any required CSS /
     font assets via the L2 build pipeline.
  3. Verify §5's four guarantees still hold; flip this doc's Status → `resolved`.
  4. Walk §4 row by row; mark each sub-topic `delivered` with a citation to the delivered file(s).

**Re-entry prompt** (verbatim, suitable for a fresh session):

> Read `docs/arch/pwa/foundations.md` §6 and the delivered design-system files. Integrate the
> delivered Tailwind scheme into the PWA per the §6 steps; verify the §5 guarantees; close out the
> L1 sub-topics in §4 with citations to the delivered artifacts.

## 7. Loose ends

- **Design-system delivery itself.** Pending; user-authored in Claude Design.
- **Exact Tailwind major / minor.** Pinned to delivery; current stable at this entry is 4.3.0
  (2026-05-08).
- **D-NN candidate.** The §2 source-of-truth decision (external Claude Design, Tailwind-compatible
  scheme, PWA consumes) is worth a formal `decision-log` entry so PWA code / config can cite it.
  Offered at session end.
- **L2 / Tailwind constraint.** The L2 framework + build choice must keep Tailwind v4-class
  tooling viable. Forwarded to [`app-shell.md`](app-shell.md).
- **NFR-8 a11y verification.** Confirm on delivery that tap-target sizing, focus, contrast are
  prescribed; missing pieces go to the design source or to
  [`unresolved-dependencies.md`](unresolved-dependencies.md) §2 — not into PWA code.
