---
id: D-19
status: resolved
title: "npm distribution posture"
resolved-on: 2026-07-02
affects: "docs/build-plan.md Track 8 / 6J row; docs/prd/06-distribution.md Distribution channels section; README.md Quick install + Phase-status banner; docs/deployment.md upgrade loop + platform notes"
surfaced-by: "docs/superpowers/plans/2026-07-02-npm-distribution.md — operator-requested implementation of the npm slice of Track 8 distribution ahead of the full surface (Docker/Compose/Helm), which [[d-16-phase-1-ships-without-distribution]] deferred to post-2.0 in its entirety."
---

# D-19 — npm distribution posture

**Status:** resolved (2026-07-02)
**Affects:** `docs/build-plan.md` Track 8 / 6J row; `docs/prd/06-distribution.md` Distribution channels section; `README.md` Quick install + Phase-status banner; `docs/deployment.md` upgrade loop + platform notes.
**Surfaced by:** `docs/superpowers/plans/2026-07-02-npm-distribution.md` — operator-requested implementation of the npm slice of Track 8 distribution ahead of the full surface (Docker/Compose/Helm), which [[d-16-phase-1-ships-without-distribution]] deferred to post-2.0 in its entirety.

## Question

Now that the operator wants the npm slice of Track 8 distribution built (ahead of Docker/Compose/Helm, which stay deferred), what concrete posture should it ship under — registry scope, package boundaries, release trigger, and native-dependency strategy for `node-pty` / `better-sqlite3`?

## Context

[[d-16-phase-1-ships-without-distribution]] deferred all of 6J (npm tarball, Docker image, Compose) to Track 8 because the operator wasn't ready to commit to the full distribution surface, and because two Phase 0 surprises were unresolved: the macOS `node-pty` spawn-helper exec-bit drop, and the Linux `build-essential` requirement (no Linux prebuild existed for the pinned `node-pty` version at the time).

The operator has now decided to ship the npm slice specifically, while leaving Docker/Compose/Helm and the extension marketplace listing deferred. This decision fixes the concrete shape so implementation (this branch, `worktree-feat+npm-distribution`) has a single contract to build against: what npm scope to publish under, whether the protocol package ships as a second published artifact or gets inlined, what triggers a release, and how the native-dependency install story avoids requiring a C++ toolchain on the common platforms.

## Options under consideration

- **Option A — `@techgardencode` public user scope; dual-package lockstep publish; tag-triggered release; hybrid native-dep strategy; Windows best-effort.** (Chosen.) Publish `@techgardencode/relay` and `@techgardencode/protocol` under the maintainer's existing public npm user scope (no org to create). Both packages version and publish in lockstep from one `pnpm -r publish`. A pushed `v*` tag triggers `release.yml`, which builds, tests, and publishes both packages with npm provenance. Native deps ship prebuilt where the upstream package offers it (macOS x64/arm64, Linux x64/arm64 glibc) and fall back to compile-from-source elsewhere (musl, exotic arches); Windows is CI build-only and explicitly experimental, never a release blocker.
- **Option B — Publish under a dedicated npm org** (e.g. `@relay-project`). Clearer branding, separates the project's public identity from the maintainer's personal npm account. Rejected: creating and administering an npm org is unwarranted process for a single-maintainer project at this stage — a personal user scope publishes today with zero additional setup, and the package name is trivially re-scoped later (npm supports transferring packages) if the project ever needs org-level publish access.
- **Option C — Single combined package** (server bundles the protocol schemas inline instead of publishing `@techgardencode/protocol` separately). Simpler publish surface (one tarball, one version). Rejected: it breaks the existing internal module boundary — `packages/protocol/` is the single source of truth for wire shapes per `docs/arch/repo-layout.md` §5, consumed by both the server and the extension at build time. Inlining would require either duplicating the schemas or adding a bundling step neither package currently needs, for no publish-time benefit (`pnpm -r publish` already handles multi-package release in one command).
- **Option D — Vendor-in-CI / compile-only native-dep strategy** instead of adopting an upstream `node-pty` version with Linux prebuilds. Would give full control over the prebuild artifacts but adds real CI maintenance burden (a build matrix per target triple, artifact signing/hosting). Rejected once `node-pty@1.2.0-beta.14`'s published tarball was confirmed (via `npm pack` inspection) to already ship `prebuilds/linux-x64/pty.node` and `prebuilds/linux-arm64/pty.node` — the vendor path would duplicate work upstream already did. See [[nd-45-node-pty-linux-prebuild-resolution]] for the sub-decision this forced.

## Current thinking

N/A — resolved in a single implementation pass per the linked kickoff plan; no extended open-question period preceded this entry.

## Resolution

**Adopt Option A.** The npm slice of Track 8 ships under this contract:

1. **Registry scope.** Public npm, `@techgardencode` user scope. No org. First publish uses `--access public` (required for scoped packages); `publishConfig.access: "public"` is set in both package manifests so subsequent publishes don't need the flag repeated.
2. **Package boundary.** Two published packages, versioned and released together: `@techgardencode/relay` (the server + CLI + `relay attach`, `bin: relay`) and `@techgardencode/protocol` (the Zod wire schemas, a dependency of both the server and the unpublished `relay-extension`). `relay-extension` stays `private: true`, unpublished — extension-marketplace distribution remains deferred to Track 8's remaining scope.
3. **Release trigger.** A pushed `v*` tag (e.g. `v0.1.0`) runs `.github/workflows/release.yml`: checkout → install → build → test → `pnpm -r publish --access public --provenance --no-git-checks`. `ci.yml` runs on every PR/push to `main` (Ubuntu + macOS, Node 22) as the pre-merge gate; the release workflow is a separate, tag-only trigger so a merge to `main` never auto-publishes. (npm provenance is attached by the `NPM_CONFIG_PROVENANCE` env var in that workflow step, **not** by the `--provenance` flag, which is a no-op under pnpm recursive publish — v0.1.0 shipped without an attestation before this was corrected; see [[nd-46-npm-provenance-requires-config-env]].)
4. **Native-dependency strategy — hybrid.** `node-pty` is bumped to `1.2.0-beta.14`, whose published tarball ships prebuilt `pty.node` for `darwin-{x64,arm64}` and `linux-{x64,arm64}` — so a fresh `npm i` needs no compiler on the common platforms (see [[nd-45-node-pty-linux-prebuild-resolution]] for the verification and the rejected vendor-in-CI fallback). `better-sqlite3` already ships prebuilds for these targets upstream. A `postinstall` script (`packages/server/scripts/postinstall.mjs`) re-chmods the macOS spawn-helper (closing Phase 0 surprise §1) and verifies both native addons load, printing actionable guidance on failure without ever aborting the install — a failed native load must not leave `relay` uninstalled and undiagnosable. `relay doctor` gained a matching `native-deps` probe so a broken install surfaces at diagnostic time, not at first `POST /sessions`. Platforms without a prebuild (Alpine/musl, non-x64/arm64 architectures) fall back to compiling from source at install time, which requires a C++ toolchain (`build-essential`/`python3` on Linux) — this is the documented, non-blocking fallback, not a regression.
5. **Windows — best-effort, non-blocking.** `ci.yml` runs a `windows-latest` build-only leg (`continue-on-error: true`) for visibility; Windows is not part of the release gate and is documented as experimental. No Windows-specific native-dep work is in scope for this decision.
6. **Scope relative to D-16.** This decision **advances [[d-16-phase-1-ships-without-distribution]] for the npm slice only.** Docker image, Docker Compose (Caddy + Tailscale sidecar), the Helm chart, and the extension-marketplace listing remain deferred to Track 8, unchanged from D-16's original scope. Publishing the npm packages does not itself flip Track 8 to `done` — see the Track 8 / 6J row annotation in `docs/build-plan.md`.
7. **Publishing itself is operator-gated**, not part of this decision's implementation. `NPM_TOKEN` must be set as a repo secret and a `v0.1.0` tag pushed by the maintainer before any package actually reaches the registry; this decision fixes the *shape* the eventual publish follows.

**Why this and not Option B (dedicated org):** no functional gap the personal scope leaves open at single-maintainer scale; an org is straightforward to introduce later without touching the package names.

**Why this and not Option C (single package):** would undo the existing protocol/server module boundary for no publish-time savings — `pnpm -r publish` already publishes both packages in one command.

**Why this and not Option D (vendor-in-CI):** the upstream beta already ships the exact prebuilds a vendor pipeline would have produced; building and maintaining a parallel CI pipeline for artifacts that already exist upstream is pure overhead.

**Surfaces new sub-questions:** [[nd-45-node-pty-linux-prebuild-resolution]], [[nd-46-npm-provenance-requires-config-env]].

**Propagated to:** `docs/build-plan.md` Track 8 / 6J row (2026-07-02); `docs/prd/06-distribution.md` Distribution channels section (2026-07-02); `README.md` Quick install snippets + Phase-status banner (2026-07-02); `docs/deployment.md` install snippet + upgrade loop + platform notes (2026-07-02).
