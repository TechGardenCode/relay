# Design — npm distribution + CI for Relay

**Date:** 2026-07-02
**Status:** approved (brainstorming), pending implementation plan
**Owner:** operator (Tech Garden)
**Lineage:** advances the npm slice of build-plan task **6J** (Distribution), deferred by [D-16](../../decisions/D-16-phase-1-ships-without-distribution.md) to Track 8. Docker/Compose/Helm and the extension marketplace remain deferred.

---

## 1. Motivation

Today Relay is consumable only from source (`node packages/server/dist/cli/relay.js` via a symlink, per the D-16 dev/source-install path). The operator wants to consume Relay **the way a customer will** — install and upgrade with a single command, no repo checkout, no manual build — so the dogfood loop matches the real distribution surface. This effort delivers the **npm publish + CI** portion of that surface. It deliberately excludes Docker, Compose, Helm, and extension-marketplace publishing, keeping it a single clean spec.

## 2. Goals

- Publish `@techgardencode/relay` (the single binary, per [D-08](../../decisions/D-08-single-binary-vs-separate-packages.md)) and `@techgardencode/protocol` to the **public** npm registry.
- `npm i -g @techgardencode/relay` installs a working `relay` command with **no build toolchain required on the platforms that matter** (macOS, Windows, mainstream/glibc Linux).
- GitHub Actions runs validation (typecheck / lint / format / build / test) on every PR and push, and publishes on a version tag.
- A **one-command upgrade-and-verify** loop: `npm i -g @techgardencode/relay@latest && relay doctor`.

## 3. Non-goals (this effort)

- Docker image / GHCR / Docker Compose / Helm. The release workflow is *structured* so a `docker-publish` job appends later, but nothing Docker is built here.
- VS Code / Open VSX extension marketplace publishing (separate Track 8 work).
- A bespoke prebuild matrix for native deps we don't own (see §6).
- Full Windows validation (Windows is best-effort — see §6, §9).
- Alpine/musl guaranteed zero-toolchain (covered by compile-fallback, not prebuilds).
- `changesets` or automated version management (git-tag trigger is sufficient for a solo release cadence).

## 4. Decisions locked during brainstorming

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Public npm under the `@techgardencode` user scope.** Package names become `@techgardencode/relay` and `@techgardencode/protocol`. | Operator's npm username is `techgardencode`, so the `@techgardencode` **user scope exists automatically — no org to create**. Consistent with the username and with the Docker Hub namespace (`techgardencode/relay`) / `ghcr.io/techgardencode/relay` later. Public matches "how customers install." |
| D2 | **Publish `@techgardencode/protocol` as its own package, lockstep with the server.** | No new bundler tooling; keeps the existing `tsc` project-reference build. `workspace:^` is rewritten to the real version at publish. |
| D3 | **Tag-triggered release.** Push `vX.Y.Z` → CI builds, tests, publishes. | Simplest deliberate trigger; the tag doubles as the future Docker image tag. |
| D4 | **Hybrid native-dep posture** (see §6). | Post-install compile is the *automatic* fallback but requires a toolchain; prebuilds are the only zero-toolchain path. Hybrid uses prebuilds where free and compile-fallback everywhere else. |
| D5 | **Windows best-effort.** Native deps build (upstream prebuilds), CI covers Windows build-only (non-blocking), docs mark it experimental; app behavior unvalidated. | Native-dep side is free; validating raw-mode TTY / paths / `claude` discovery on Windows is out of proportion to current need. |

## 5. Publishable package shape

**Rename (mechanical, delegatable):**

- `@relay/relay → @techgardencode/relay`, `@relay/protocol → @techgardencode/protocol`.
- Update the ~19 source files importing `@relay/protocol` (13 in `packages/server`, 6 in `packages/extension`), the 3 `package.json` names/deps, and tsconfig project references. Regenerated `dist/*.d.ts` are not hand-edited.
- The **`bin` name stays `relay`** — the command a user types is independent of the scoped package name. `npm i -g @techgardencode/relay` still yields a `relay` command.

**Per-package publish metadata (both packages):**

- Remove `"private": true`.
- Real `"version"` starting at **`0.1.0`** (repo currently at the `0.0.0` placeholder).
- `"publishConfig": { "access": "public", "provenance": true }` (scoped packages default to restricted; provenance adds a supply-chain attestation from CI).
- `"repository"`, `"license"`, `"description"`, `"homepage"`/`"bugs"` as appropriate.
- `"files"` allowlist so the tarball is minimal but complete.

**Dependency direction:** `@techgardencode/relay` depends on `@techgardencode/protocol: "workspace:^"`. `pnpm publish` rewrites `workspace:^` to the concrete version at pack time. Both packages bump and publish together (lockstep).

**Packaging catch to handle explicitly:** the SQLite migration files under `packages/server/src/store/migrations/*.sql` are **not** copied to `dist/` by `tsc`. The existing `migrations-dir.ts` resolver already does a dist-then-source fallback, so the fix is to include `src/store/migrations/*.sql` in the server's `"files"` allowlist so they ship in the tarball and the resolver finds them. Without this, a fresh global install 500s on first DB access. A `npm pack` smoke test (see §10) is the guard against regressing this.

## 6. Native dependencies — hybrid posture

Two native addons: `node-pty` (`pty.node` + macOS `spawn-helper`) and `better-sqlite3` (`better_sqlite3.node`). For Linux, **libc is what matters, not distro** — Ubuntu/Debian/Fedora/Arch are all glibc and interchangeable; Alpine (musl) is the outlier.

Both deps already ship an install script of the form "use a prebuild if present, else compile from source":

- `node-pty`: `node scripts/prebuild.js || node-gyp rebuild`
- `better-sqlite3`: `prebuild-install || node-gyp rebuild`

So **compile-on-install is already automatic** on any platform lacking a prebuild — but it requires a C++ toolchain (compiler + make + python3) on the target machine. A postinstall script cannot conjure a compiler; it can only detect, repair, and guide.

### 6.1 Coverage matrix

| Target | node-pty | better-sqlite3 | Zero-toolchain? |
|---|---|---|---|
| macOS x64 / arm64 | prebuilt ✓ | prebuilt ✓ | **Yes** (today) |
| Windows x64 / arm64 | prebuilt ✓ (conpty) | prebuilt ✓ | **Yes** (native deps; app unvalidated) |
| Linux x64 / arm64 **glibc** | ✗ compiles | prebuilt ✓ | **Yes** once §6.2 lands |
| Linux **musl** (Alpine) / exotic arch | ✗ compiles | ✗/✓ varies | No — compile-fallback (needs toolchain) |

### 6.2 The one gap: node-pty on Linux glibc (spike, task 1)

`node-pty@1.1.0` ships prebuilds for darwin + win32 only — no `prebuilds/linux-*`. Resolution is a decision tree, cheapest first:

1. **Bump to `node-pty@1.2.0-beta.14`** (the 1.2.0 line is where upstream added prebuildify/Linux prebuilds). Verify it ships `prebuilds/linux-x64` (and ideally `linux-arm64`), and that the full pty/TUI test suite **and** the VM-e2e run stay green. If yes → done, near-free. *Risk: it is a beta.*
2. **If the beta is unacceptable** → CI compiles node-pty on `ubuntu-latest` and vendors the resulting `.node` + `spawn-helper` into a shipped `prebuilds/linux-x64/`, with our postinstall placing it where node-pty's loader looks. Deterministic on stable node-pty; more work.
3. **Last resort** → document `build-essential` + `python3` as a Linux-only prerequisite (the compile-fallback path). Only if 1 and 2 both fail.

This is the **single real risk** in the effort and is sequenced first so we learn the outcome before committing downstream work. macOS zero-toolchain holds regardless.

### 6.3 `scripts/postinstall.mjs` (our thin postinstall)

Runs on the user's machine after `npm i -g`. It:

1. **Repairs** the macOS `node-pty` spawn-helper executable bit (generalizes the in-repo `packages/server/scripts/fix-pty.mjs`; a bulletproof guard — plain `npm` usually preserves modes, but this removes all doubt). No-op on non-macOS.
2. **Verifies** that `node-pty` and `better-sqlite3` `require()` cleanly.
3. On failure, **prints precise guidance** — which toolchain to install, or "this platform (e.g. Alpine/musl) is experimental." It **never** attempts to install compilers or use sudo.

### 6.4 Runtime guard

Extend the existing `relay doctor` (from Track 7E) native-dep preflight to actually `require()` the pty + sqlite addons, so a broken install fails loud with a remediation line rather than at first `POST /sessions`.

## 7. CI — GitHub Actions

Two workflows under `.github/workflows/`.

### 7.1 `ci.yml` — validation (on PR + push to `main`)

- **Matrix:** `{ ubuntu-latest, macos-latest } × node 22` — full pipeline: `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test`.
- **Windows leg:** `windows-latest`, build + typecheck only, `continue-on-error: true` (visibility without blocking, per D5).
- The `vm-e2e`, `relay-deploy`, real-`claude`, and cross-device paths are **skills, not Vitest tests**, so the suite is hermetic in CI. `ubuntu-latest` has a toolchain preinstalled, so node-pty compiling from source in CI is free even before §6.2 lands.
- This is also the operator's "test with one command" — it runs on every push.

### 7.2 `release.yml` — publish (on tag `v*`)

- Checkout, `pnpm install`, `pnpm build`, `pnpm test` (sanity gate).
- `pnpm -r publish --access public --provenance`, authed via a `NPM_TOKEN` repo secret (npm **automation** token). Recursive publish naturally targets only the non-`private` workspace packages (the two `@techgardencode/*`; `extension` stays private, `pwa` is empty) and resolves topological order, so `@techgardencode/protocol` publishes before `@techgardencode/relay`. Provenance requires `permissions: { id-token: write, contents: read }`.
- Job-structured so a future `docker-publish` job (build + push to Docker Hub/GHCR at the same tag) appends without reshaping the workflow.

### 7.3 Secrets / prerequisites (operator, one-time)

- No npm org needed — the `@techgardencode` user scope exists from the username. (First publish of a scoped package still requires `--access public`, already set in `publishConfig`.)
- Generate an npm **automation** access token; add as the `NPM_TOKEN` GitHub Actions secret.

## 8. Upgrade / release loop (the operator-facing deliverable)

- **Upgrade + verify (one line):** `npm i -g @techgardencode/relay@latest && relay doctor`
- **Cut a release (operator side):** bump versions (both packages, lockstep) → `git tag v0.1.0 && git push --tags` → CI publishes.
- **No `relay upgrade` wrapper.** The npm one-liner *is* the command; a wrapper that shells out to npm is YAGNI.

## 9. Documentation updates

- README "Quick install" + Phase-status banner: the npm path is now real for `@techgardencode/relay`; keep the honest platform caveats (Windows experimental; Alpine/musl may compile).
- `docs/deployment.md` / handbook: the `npm i -g @techgardencode/relay@latest && relay doctor` upgrade loop; Linux libc note; Windows-experimental note.
- Docker sections stay marked "not yet published."

## 10. Verification / acceptance criteria

The effort is done when:

1. `ci.yml` is green on `ubuntu-latest` + `macos-latest` (Windows leg reporting, non-blocking).
2. `npm pack` produces a tarball that, installed globally in a **clean environment** (no repo, no prior build), yields a working `relay` — verified by `relay doctor` passing and a smoke `relay server` + one session. Run on macOS **and** on the Ubuntu VM (existing `vm-e2e` / `relay-deploy` target) **before** the first real publish.
3. A tag push publishes both packages public; a fresh machine can `npm i -g @techgardencode/relay` and reach a first session with **no manual build step** on macOS + Linux-glibc.
4. The node-pty-Linux spike (§6.2) is resolved and its outcome recorded (decision log).

## 11. Decisions to file (repo idiom)

This repo is decision-log-driven; the following land via the `decision-log` skill during implementation:

- **New `D-NN` — "npm distribution posture."** `@techgardencode` public user scope, dual-package lockstep, tag-triggered release, hybrid native-dep strategy, Windows best-effort. Advances [D-16](../../decisions/D-16-phase-1-ships-without-distribution.md)'s deferral for the **npm slice only**; Docker/Compose/Helm remain deferred to Track 8.
- **New `ND-NN` — node-pty Linux prebuild resolution,** recording which branch of §6.2 was taken and why.

Code that encodes non-obvious behavior (postinstall chmod, migrations-in-`files`, compile-fallback reliance) cites the relevant `D-NN`/`ND-NN` per the CLAUDE.md convention.

## 12. Execution kickoff (post-approval, not part of this spec)

- Create a worktree off `main`: `git worktree add ../relay-npm-dist -b feat/npm-distribution`. Keeps `main` free for parallel sessions; commit locally on the branch, no pushes until the operator says so.
- Sequence: **(1) node-pty-Linux spike** → (2) rename + publish metadata → (3) postinstall + `relay doctor` guard → (4) `ci.yml` → (5) `release.yml` → (6) `npm pack` clean-env + VM smoke → (7) docs → (8) file D-NN/ND-NN → (9) first tag publish.

---

## Appendix — risk summary

| Risk | Likelihood | Mitigation |
|---|---|---|
| node-pty `1.2.0-beta` unstable or lacks linux prebuild | Medium | Vendor-in-CI fallback (§6.2 step 2); worst case document Linux toolchain prereq (step 3). Spike is task 1. |
| Migrations `.sql` missing from tarball → runtime 500 | Low (once `files` set) | `npm pack` clean-env smoke test in acceptance (§10.2). |
| `NPM_TOKEN` not set up | Low | One-time operator prerequisite called out (§7.3); no org creation needed under the user scope. |
| Windows app behavior broken | Known/accepted | Documented experimental; CI Windows leg is build-only, non-blocking (D5). |
