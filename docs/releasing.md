# Relay — Release Runbook (maintainer-facing)

> Operator/maintainer only. This is how `@techgardencode/relay` + `@techgardencode/protocol`
> get published to npm. For install/upgrade as a user of Relay, see
> [`deployment.md`](deployment.md) and [`guides/getting-started.md`](guides/getting-started.md).

Both packages publish in lockstep from a pushed `v*` tag via
[`.github/workflows/release.yml`](../.github/workflows/release.yml), per
[D-19](decisions/D-19-npm-distribution-posture.md). Nothing publishes on merge to `main` —
only a tag push triggers `release.yml`.

## One-time prerequisites (operator only, do once)

1. On npmjs.com, create an **automation** access token scoped to the `@techgardencode` user
   account. No npm org is needed — both packages publish under the personal `@techgardencode`
   user scope with `publishConfig.access: public`.
2. Add the token as a GitHub repo secret named `NPM_TOKEN`
   (Settings → Secrets and variables → Actions → New repository secret). `release.yml` reads it
   as `NODE_AUTH_TOKEN`.

## Cutting a release

1. Confirm `packages/server/package.json` and `packages/protocol/package.json` versions match
   the tag you're about to cut (both are `0.1.0` as of this writing; the `workspace:^` dependency
   keeps them in lockstep per D-19).
2. Push the branch and open a PR. Wait for CI (`.github/workflows/ci.yml`) to go green on both
   `ubuntu-latest` and `macos-latest` (Windows runs build-only, `continue-on-error`).
3. Merge to `main`.
4. Tag and push:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
   This triggers `release.yml`, which builds, tests, and runs
   `pnpm -r publish --access public --provenance --no-git-checks` — publishing both
   `@techgardencode/protocol` and `@techgardencode/relay` with npm provenance.

## Verify the release

```bash
npm view @techgardencode/relay version   # expect 0.1.0
npm i -g @techgardencode/relay@latest
relay doctor                              # native-deps: ok
```

## Acceptance evidence (this task, 2026-07-02, macOS/darwin-arm64)

Ran ahead of the first real publish, against local tarballs only — no `npm publish`, no `git push`:

- `pnpm build` + `pnpm pack` both packages to a scratch dir; confirmed the `@techgardencode/relay`
  tarball contains `src/store/migrations/000{1,2}_*.sql` and `dist/cli/relay.js`.
- Clean-room global install (`npm install -g --prefix <tmp> protocol.tgz relay.tgz`, both local
  tarballs in one command so npm cross-resolves `@techgardencode/protocol` without a registry
  copy): `relay --version` → `0.1.0`. `node-pty` and `better-sqlite3` installed from prebuilt
  binaries in ~2s — no compiler invoked (per
  [ND-45](decisions/ND-45-node-pty-linux-prebuild-resolution.md)). Postinstall's macOS
  spawn-helper chmod ran (executable bit confirmed on the darwin-arm64 prebuild).
- `relay init` + `relay doctor` against a throwaway `HOME`: **`native-deps: ok`** (node-pty +
  better-sqlite3 load) — the core proof for this task. `relay-home`, `tokens`, `storage` also
  `ok`. `credentials` FAIL and `server` WARN are expected with no `claude login` session and no
  token in a scratch home — not a distribution defect.

### Deferred: Linux VM clean-room smoke

Step 4 of the acceptance plan (`docs/superpowers/plans/2026-07-02-npm-distribution.md` Task 9)
calls for the same clean-room install on the Ubuntu VM (`techgardencode@10.0.60.221`) to prove
zero-`build-essential` install on Linux glibc — the real test of the Linux-prebuilt `node-pty`
premise ([ND-45](decisions/ND-45-node-pty-linux-prebuild-resolution.md)). SSH to the VM was not
reachable from this session (`ssh ... techgardencode@10.0.60.221 true` timed out). **Operator
follow-up before or shortly after the first publish:**

```bash
scp techgardencode-protocol-0.1.0.tgz techgardencode-relay-0.1.0.tgz techgardencode@10.0.60.221:~
ssh techgardencode@10.0.60.221
npm install -g --prefix ~/relaytest ./techgardencode-protocol-0.1.0.tgz ./techgardencode-relay-0.1.0.tgz
~/relaytest/bin/relay --version    # expect 0.1.0
~/relaytest/bin/relay doctor       # expect native-deps: ok, no build-essential required
```

Or, once published, just `npm view` + `npm i -g @techgardencode/relay@latest` on the VM directly
(skips the tarball copy step). The `vm-e2e` / `relay-deploy` skills target this same host.
