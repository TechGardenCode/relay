# Relay — Design docs

Product, UX, and interaction design for Relay's client surfaces. This is the **how it should
feel and behave from the user's side** layer, distinct from the other doc trees:

| Tree | Owns | Reads like |
| --- | --- | --- |
| `docs/prd/` | What Relay is and why — scope, value, goals | a spec / contract |
| `docs/arch/` | System architecture — protocols, schema, module boundaries | a contributor reference |
| `docs/decisions/` | The decision log — one file per `D-NN`/`ND-NN` | a deliberation record |
| **`docs/design/`** | **Product / UX / interaction design for client surfaces** | **a design brief** |
| `docs/guides/` | User-facing handbook (how to use Relay) | an end-user manual |

A design doc here resolves *product* questions (what the surface does, how it's laid out, how the
user interacts) and cites the `docs/decisions/` entries and `docs/arch/` contracts it builds on. It
does **not** redefine protocol or schema — that stays in `docs/arch/`; design docs flag the
*additive* touch points a surface needs and leave the concrete wire shape to the relevant arch doc.

## Index

- [`pwa/`](pwa/README.md) — the Phase 2 mobile/web PWA (terminal-style monitoring + prompting
  client). Resolves [`D-18`](../decisions/D-18-pwa-terminal-substrate-and-mvp-scope.md).
