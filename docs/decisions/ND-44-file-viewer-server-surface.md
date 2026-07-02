---
id: ND-44
status: open
title: "File-viewer server surface — read-only working-dir listing + file read"
affects: "docs/arch/rest-conventions.md §4 (additive sub-resource routes); packages/server/src/server/rest/ (the handlers); docs/decisions/D-18-pwa-terminal-substrate-and-mvp-scope.md §4 (read-only, no editing/diff); docs/arch/pwa/unresolved-dependencies.md §2.1; docs/arch/pwa/feature-modules.md §6 (FR-13 file viewer)."
surfaced-by: "docs/arch/pwa/feature-modules.md §6 (L4 UI decomposition, P2-PWA-tech, 2026-07-02) — no equivalent seed existed in docs/design/pwa/server-touchpoints.md; governed by [[d-18-pwa-terminal-substrate-and-mvp-scope]]."
---

# ND-44 — File-viewer server surface — read-only working-dir listing + file read

**Status:** open
**Affects:** [`docs/arch/rest-conventions.md`](../arch/rest-conventions.md) §4 (additive sub-resource routes); `packages/server/src/server/rest/` (the handlers); [[d-18-pwa-terminal-substrate-and-mvp-scope]] §4 (read-only, no editing/diff); [`docs/arch/pwa/unresolved-dependencies.md`](../arch/pwa/unresolved-dependencies.md) §2.1; [`docs/arch/pwa/feature-modules.md`](../arch/pwa/feature-modules.md) §6.
**Surfaced by:** [`docs/arch/pwa/feature-modules.md`](../arch/pwa/feature-modules.md) §6 (L4 UI decomposition, P2-PWA-tech, 2026-07-02) — no equivalent seed existed in [`docs/design/pwa/server-touchpoints.md`](../design/pwa/server-touchpoints.md); governed by [[d-18-pwa-terminal-substrate-and-mvp-scope]].

## Question

The PWA file viewer (FR-13) is a read-only file tree + light text viewer over a session's working dir.
The PWA is a browser client with **no filesystem access to the server host**, and the canonical REST
surface today (projects + sessions + transcript) has **no directory-listing or file-read endpoint**.
What is the additive server surface that lists a session's working-dir tree and reads a single file's
contents, and how is it sandboxed to that working dir?

## Elaboration prompt

Design the additive REST shape following the sub-resource convention in
[`rest-conventions.md`](../arch/rest-conventions.md) §4 — a natural fit is `GET /sessions/:id/files`
for the tree and `GET /sessions/:id/files/*` (or a `?path=` query) for a single file's contents, both
resolved against the session's working dir. Settle: **path-traversal / sandboxing** (reject `..`
escapes; resolve symlinks inside the working-dir root only); **max-file-size** and **binary-vs-text**
handling for the "light text viewer" (refuse or truncate large/binary files rather than stream
megabytes); **eager vs. lazy** tree loading (whole tree up front vs. per-directory expansion — mobile
argues lazy). Keep it **read-only** — no write, no diff-approval endpoint
([[d-18-pwa-terminal-substrate-and-mvp-scope]] §4; editing is remote VS Code's job). The feature is
**conditional/separable** (FR-13), so this may defer to a fast-follow if the first server pass is full.
Hold NFR-5: the route is canonical and any client may call it — the PWA gets no privileged path. On
resolution, land the route(s) in `rest-conventions.md` §4 and the handlers under `server/rest/`.

## Resolution

*(unresolved)*
