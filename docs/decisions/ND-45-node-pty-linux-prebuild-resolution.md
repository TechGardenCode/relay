---
id: ND-45
status: resolved
title: "node-pty Linux prebuild resolution"
resolved-on: 2026-07-02
affects: "packages/server/package.json (node-pty dependency version); packages/server/scripts/postinstall.mjs (native-addon repair/verify comment citation)"
surfaced-by: "[[d-19-npm-distribution-posture]] resolution point 4 (hybrid native-dep strategy) — required confirming node-pty's Linux prebuild story before the npm slice could claim zero-build-tools install on Linux."
---

# ND-45 — node-pty Linux prebuild resolution

**Status:** resolved (2026-07-02)
**Affects:** `packages/server/package.json` (`node-pty` dependency version); `packages/server/scripts/postinstall.mjs` (native-addon repair/verify comment citation).
**Surfaced by:** [[d-19-npm-distribution-posture]] resolution point 4 (hybrid native-dep strategy) — required confirming node-pty's Linux prebuild story before the npm slice could claim zero-build-tools install on Linux.

## Question

At the pinned `node-pty` version (`^1.1.0`), Linux has no published prebuild — [`docs/phase-0-report.md`](../history/phase-0-report.md) §5 documented this as a Phase 0 surprise requiring `build-essential`/`python3` on any Linux install. Does a newer `node-pty` version ship Linux prebuilds, and if so, does adopting it close the gap without a vendor-in-CI fallback?

## Elaboration prompt

Check whether any published `node-pty` release (stable or pre-release) ships `prebuilds/linux-{x64,arm64}/pty.node` in its npm tarball — inspect the actual tarball contents (`npm pack` + `tar tzf`), not just changelog claims, since prebuild coverage is a packaging detail that can lag or precede semver bumps. If a version does ship them, verify the API surface (`spawn`/`IPty`) is unchanged from the currently pinned version so the bump is a pure dependency swap with no code migration. If no version ships Linux prebuilds, the fallback is D-19 Option D (vendor-in-CI): build `pty.node` for `linux-{x64,arm64}` in a CI job and publish the artifacts alongside the package, which carries real ongoing maintenance cost (a build matrix, artifact hosting/signing) — weigh that cost against simply documenting the `build-essential` requirement as a permanent Linux install caveat.

## Resolution

**Adopted `node-pty@1.2.0-beta.14`.** Its published tarball was inspected directly (`npm pack node-pty@1.2.0-beta.14 && tar tzf ...`) and confirmed to ship prebuilt native addons for all four target platforms Relay cares about: `prebuilds/darwin-x64/pty.node`, `prebuilds/darwin-arm64/pty.node` (+ `spawn-helper`), `prebuilds/linux-x64/pty.node`, and `prebuilds/linux-arm64/pty.node`. The `spawn`/`IPty` API is unchanged from `1.1.0`, so the bump was a pure `package.json` version-string change plus a `pnpm install` — no call-site edits anywhere in `packages/server/src/pty/`.

**Consequences:**
1. A fresh `npm i -g @techgardencode/relay` on macOS or Linux (glibc, x64/arm64) needs **no C++ toolchain** — the exact prebuild is fetched from npm and used as-is. This closes [`docs/phase-0-report.md`](../history/phase-0-report.md) §5 (the Linux `build-essential` requirement) for the platforms it names.
2. The macOS spawn-helper exec-bit issue ([`docs/phase-0-report.md`](../history/phase-0-report.md) §1) is unaffected by this specific bump — it's addressed separately by `packages/server/scripts/postinstall.mjs`'s `chmodSpawnHelper()` step, which now also carries this decision's citation since both fixes ship in the same postinstall script.
3. Platforms without a prebuild in this tarball (Alpine/musl, non-x64/arm64 architectures, Windows) still compile from source at install time, requiring a C++ toolchain there — this is the documented fallback per [[d-19-npm-distribution-posture]] point 4, not a regression from the pre-bump state (which required a toolchain on Linux unconditionally).
4. **The vendor-in-CI fallback (D-19 Option D) was not needed.** No CI build matrix, no artifact hosting, no signing pipeline — the dependency bump alone closes the gap. This keeps the release workflow (`release.yml`) simple: `pnpm -r publish` ships whatever `node-pty` itself published, with no Relay-owned build step in between.
5. Being a `-beta` release, `node-pty@1.2.0-beta.14` carries the usual pre-1.0-of-a-point-release stability caveat; the full test suite (`pnpm -F @techgardencode/relay test src/pty src/attach src/server/ws`) was re-run against it and stayed green (432 baseline, unchanged pass count) before the bump was accepted.

**Why not the vendor-in-CI fallback:** it would duplicate prebuild artifacts the upstream package already publishes, at ongoing CI maintenance cost, for zero additional platform coverage.

**Propagated to:** `packages/server/package.json` `node-pty` dependency pinned to `^1.2.0-beta.14` (2026-07-02, landed pre-decision as `build(deps): adopt node-pty@1.2.0-beta.14 for Linux prebuilds`, cited retroactively); `packages/server/scripts/postinstall.mjs` header comment now cites `D-19 / ND-45` in place of the `D-npm / ND-node-pty` placeholder (2026-07-02).
