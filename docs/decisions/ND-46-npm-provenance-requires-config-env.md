---
id: ND-46
status: resolved
title: "npm provenance requires NPM_CONFIG_PROVENANCE under recursive publish"
resolved-on: 2026-07-03
affects: ".github/workflows/release.yml (publish-step env); docs/releasing.md (release command description + verify step)"
surfaced-by: "[[d-19-npm-distribution-posture]] resolution point 3 (tag-triggered release publishes 'with npm provenance') — v0.1.0 published without an attestation despite the --provenance flag, exposing that the flag is a no-op under pnpm recursive publish."
---

# ND-46 — npm provenance requires NPM_CONFIG_PROVENANCE under recursive publish

**Status:** resolved (2026-07-03)
**Affects:** `.github/workflows/release.yml` (publish-step env); `docs/releasing.md` (release command description + verify step).
**Surfaced by:** [[d-19-npm-distribution-posture]] resolution point 3 (the release publishes "with npm provenance") — the v0.1.0 release published both packages successfully but attached **no** provenance attestation, despite `release.yml` carrying every documented ingredient (`--provenance` flag, `id-token: write`, `registry-url`).

## Question

`release.yml` runs `pnpm -r publish --access public --provenance --no-git-checks` with `id-token: write` — the shape every npm-provenance guide prescribes — yet v0.1.0 shipped with no attestation (`https://registry.npmjs.org/-/npm/v1/attestations/@techgardencode%2frelay@0.1.0` → HTTP 404, and the publish log had no `npm notice Signed provenance statement` line). What actually attaches provenance under pnpm's **recursive** publish, and how should the workflow deliver it without breaking the `workspace:^` rewrite or the protocol-before-relay publish order?

## Context

Provenance is per published version and immutable — 0.1.0 can never gain it retroactively; only a new version can. The fix must therefore land in the workflow before the next `v*` tag, and must preserve two properties the current single command gives for free:

- **`workspace:^` rewrite.** `@techgardencode/relay` depends on `@techgardencode/protocol` via `workspace:^`. Only pnpm rewrites that protocol to a concrete `^0.1.0` on publish; plain `npm publish` leaves the literal `workspace:^` in the shipped tarball, which is broken. So any fix that reaches for a bare `npm publish` loop must re-introduce the rewrite itself.
- **Dependency order.** protocol must publish before relay.

The root cause is a known pnpm behavior: the `--provenance` **CLI flag** is not reliably threaded to each package's publish under recursive (`-r`) mode. pnpm reads npm-style configuration from the environment per package, so the fix is to express provenance as npm config, not as a flag.

## Resolution

**Adopt `NPM_CONFIG_PROVENANCE=true` as a job/step env var, keeping the existing single `pnpm -r publish` command.** This is the approach real pnpm monorepos use (npm's own guidance: for tools that don't invoke `npm publish` directly, set `NPM_CONFIG_PROVENANCE`). Contract:

1. **Mechanism is the env var, not the flag.** `release.yml`'s publish step sets `NPM_CONFIG_PROVENANCE: "true"` alongside `NODE_AUTH_TOKEN`. pnpm reads it per package during recursive publish, so both `@techgardencode/protocol` and `@techgardencode/relay` get an attestation. The `--provenance` CLI flag stays on the command as documentation of intent — it is harmless and forward-compatible if a future pnpm honors it — but a code comment records that the env var is what does the work.
2. **Nothing else about the publish changes.** Still one `pnpm -r publish --access public --no-git-checks`, so the `workspace:^` → `^0.1.0` rewrite and the protocol-before-relay ordering are untouched. This is why the env-var fix is preferred over a per-package `npm publish --provenance` loop.
3. **`id-token: write` stays.** Provenance signing still needs the OIDC token; the existing job permission is unchanged.
4. **Verification is the attestation API.** After the next release, `curl https://registry.npmjs.org/-/npm/v1/attestations/@techgardencode%2f<pkg>@<version>` must return a populated `attestations` array (not HTTP 404), and the publish log must show the `Signed provenance statement` notice.
5. **0.1.0 stays un-attested.** The fix is not backported; it takes effect on the next `v*` tag. Packages install and run fine without provenance — this is supply-chain hardening, not a functional blocker.

**Why not a per-package `npm publish --provenance` loop:** it would drop pnpm's `workspace:^` rewrite, shipping a relay tarball with an unresolvable `workspace:^` protocol dependency — a functional regression to fix a hardening gap. Re-adding the rewrite by hand (or via `pnpm publish` per directory) is strictly more workflow surface than one env line for the same result.

**Why not npm trusted publishing (OIDC, no token):** it generates provenance automatically and removes the long-lived `NPM_TOKEN`, and is the better long-term posture — but it requires the operator to register a trusted publisher on npmjs.com for **each** package (repo + workflow binding) and to drop the token path. That is a larger operator change than this gap warrants right now; it is the natural follow-up once the token-based path is confirmed attaching provenance. Recorded here as the future direction, not adopted in this pass.

**Propagated to:** `.github/workflows/release.yml` publish-step env (2026-07-03); `docs/releasing.md` release-command description + Verify section (2026-07-03).
