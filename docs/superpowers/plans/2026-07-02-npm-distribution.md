# npm Distribution + CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Relay to public npm as `@techgardencode/relay` (+ `@techgardencode/protocol`) with GitHub Actions CI/release, so it installs and upgrades with one command and no build toolchain on macOS/Linux.

**Architecture:** Rename the two publishable workspace packages to the `@techgardencode` user scope; make them zero-build-tools by adopting a Linux-prebuilt `node-pty` and adding a repair/verify postinstall; add a `ci.yml` (validate on PR/push) and `release.yml` (publish on `v*` tag) workflow. Docker/Compose/extension-marketplace stay out; the release workflow is structured so a Docker job appends later.

**Tech Stack:** pnpm 10 workspaces, TypeScript project references, Vitest, GitHub Actions, `node-pty` + `better-sqlite3` (native, prebuilt), npm provenance.

**Spec:** [`docs/superpowers/specs/2026-07-02-npm-distribution-design.md`](../specs/2026-07-02-npm-distribution-design.md)

## Global Constraints

- **Package names:** `@techgardencode/relay` (server), `@techgardencode/protocol` (protocol). Extension stays `relay-extension`, `private`, unpublished.
- **`bin` name stays `relay`** — never rename the command users type.
- **Node ≥ 22**, **pnpm@10.33.2** (`packageManager` field; do not change).
- **Version:** both publishable packages start at **`0.1.0`**, bumped in lockstep.
- **Registry:** public npm, `@techgardencode` **user scope** — no org to create; first publish needs `--access public`.
- **Platform targets:** macOS x64/arm64 + Linux x64/arm64 (glibc) are zero-build-tools. Windows is best-effort/experimental (CI build-only). Alpine/musl relies on compile-fallback.
- **TS strictness:** `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` apply to source **and** specs. Guard indexed access; use `import type`.
- **Decision citations:** non-obvious code comments cite the `D-NN`/`ND-NN` this work files (see Task 8). Until those IDs exist, write `D-npm` / `ND-node-pty` as placeholders and replace them in Task 8.
- **Git:** work only on branch `worktree-feat+npm-distribution`; commit frequently; **do not push** and **do not publish** — the first real publish is an operator-gated handoff (Task 9).
- **Verification runs from the worktree root:** `/Users/kianalikhani/Development/Projects/relay/.claude/worktrees/feat+npm-distribution`.

---

### Task 1: Adopt Linux-prebuilt node-pty

Bump `node-pty` from `1.1.0` (no Linux prebuild → compiles from source) to `1.2.0-beta.14`, whose published tarball ships `prebuilds/linux-x64/pty.node` and `prebuilds/linux-arm64/pty.node`. This is the entire "zero build tools on Linux" fix.

**Files:**
- Modify: `packages/server/package.json` (dependencies → `node-pty`)
- Modify: `pnpm-lock.yaml` (via `pnpm install`)

**Interfaces:**
- Consumes: nothing.
- Produces: a `node-pty` whose install needs no compiler on macOS/Windows/Linux-glibc. No API surface change — `node-pty`'s `spawn`/`IPty` API is unchanged across 1.1.0→1.2.0.

- [ ] **Step 1: Confirm the beta ships Linux prebuilds (evidence before change)**

Run:
```bash
cd "$(mktemp -d)" && npm pack node-pty@1.2.0-beta.14 --silent >/dev/null && \
  tar tzf node-pty-1.2.0-beta.14.tgz | grep -E 'prebuilds/(linux|darwin)-(x64|arm64)/(pty.node|spawn-helper)'
```
Expected: lists `package/prebuilds/linux-x64/pty.node`, `package/prebuilds/linux-arm64/pty.node`, `package/prebuilds/darwin-arm64/pty.node`, `package/prebuilds/darwin-arm64/spawn-helper`. If Linux prebuilds are absent, STOP and fall back to spec §6.2 step 2 (vendor-in-CI) — do not proceed.

- [ ] **Step 2: Bump the dependency**

In `packages/server/package.json`, change the `node-pty` line under `"dependencies"`:
```json
    "node-pty": "^1.2.0-beta.14",
```

- [ ] **Step 3: Reinstall and repair the macOS spawn-helper bit**

Run:
```bash
pnpm install && node packages/server/scripts/fix-pty.mjs
```
Expected: install succeeds; `fix-pty` prints `chmod +x .../node-pty@1.2.0-beta.14/.../darwin-arm64/spawn-helper` (on macOS).

- [ ] **Step 4: Verify the pty/TUI suite stays green on the new version**

Run:
```bash
pnpm -F @relay/relay test src/pty src/attach src/server/ws
```
Expected: PASS, 0 failures (these are the node-pty-touching specs — supervisor, tty, tty-visual, ws handler/resize).

- [ ] **Step 5: Full baseline still green**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean; all tests pass (same count as the pre-change baseline, 432).

- [ ] **Step 6: Commit**

```bash
git add packages/server/package.json pnpm-lock.yaml
git commit -m "build(deps): adopt node-pty@1.2.0-beta.14 for Linux prebuilds (zero build tools)"
```

---

### Task 2: Rename packages to `@techgardencode` scope

Mechanical rename of `@relay/relay` → `@techgardencode/relay` and `@relay/protocol` → `@techgardencode/protocol` across package manifests and the ~19 source imports. The extension consumes `@relay/protocol` at build time, so it must be renamed too (it stays private/unpublished).

**Files:**
- Modify: `packages/server/package.json`, `packages/protocol/package.json`, `packages/extension/package.json` (`name` and/or `dependencies`)
- Modify: all `packages/**/src/**/*.ts` importing `@relay/protocol` (13 in server, 6 in extension)
- Verify-only: root `tsconfig.json` / `tsconfig.base.json` / `vitest.config.ts` (project refs are path-based; confirm no `@relay/*` `paths` alias exists)

**Interfaces:**
- Consumes: Task 1's tree.
- Produces: `@techgardencode/protocol` (the module specifier every consumer now imports) and `@techgardencode/relay` (the server package name). `bin` unchanged (`relay`).

- [ ] **Step 1: Confirm the blast radius before editing**

Run:
```bash
grep -rl "@relay/protocol" packages --include="*.ts" | grep -v '/dist/' | sort
grep -rn "@relay/" tsconfig.json tsconfig.base.json vitest.config.ts 2>/dev/null || echo "no @relay/ refs in root configs (good)"
```
Expected: ~19 source files listed; no `@relay/` in root configs (project refs are by path). If a `paths` alias for `@relay/*` shows up, add it to Step 2's edits.

- [ ] **Step 2: Rewrite package names and the workspace dependency refs**

Edit the three manifests:
- `packages/protocol/package.json`: `"name": "@relay/protocol"` → `"name": "@techgardencode/protocol"`
- `packages/server/package.json`: `"name": "@relay/relay"` → `"name": "@techgardencode/relay"`; under `"dependencies"`, `"@relay/protocol": "workspace:*"` → `"@techgardencode/protocol": "workspace:^"`
- `packages/extension/package.json`: under `"dependencies"`, `"@relay/protocol": "workspace:*"` → `"@techgardencode/protocol": "workspace:^"` (leave `"name": "relay-extension"` and `"private": true` unchanged)

- [ ] **Step 3: Rewrite the source imports**

Run (in-place rewrite of the module specifier across all non-dist TS):
```bash
grep -rl "@relay/protocol" packages --include="*.ts" | grep -v '/dist/' | \
  xargs sed -i '' 's#@relay/protocol#@techgardencode/protocol#g'
```
(On Linux CI/dev, use `sed -i` without the `''`.)

- [ ] **Step 4: Verify no stale refs remain**

Run:
```bash
grep -rn "@relay/" packages --include="*.ts" --include="*.json" | grep -v '/dist/' || echo "clean — no @relay/ refs left"
```
Expected: `clean — no @relay/ refs left`.

- [ ] **Step 5: Reinstall (relinks workspace symlinks under the new names) and verify**

Run:
```bash
pnpm install && pnpm typecheck && pnpm build && pnpm test
```
Expected: install relinks `@techgardencode/*`; typecheck clean; build clean; all tests pass (432).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(pkg): rename @relay/* to @techgardencode/* (npm user scope)"
```

---

### Task 3: Server + protocol publish metadata

Make both packages publishable: drop `private`, set `version`, add `files`/`publishConfig`/`repository`/`license`/`description`/`prepack`, and route the CLI version from `package.json` so a release bump never needs a code edit. Include the `.sql` migrations in the tarball so a fresh global install can run migrations.

**Files:**
- Modify: `packages/protocol/package.json`, `packages/server/package.json`
- Create: `packages/server/src/cli/version.ts`
- Modify: `packages/server/src/cli/relay.ts` (commander `.version(...)`), `packages/server/src/cli/doctor.ts` (drop the hardcoded `0.0.0`)
- Create: `packages/server/src/cli/version.test.ts`

**Interfaces:**
- Consumes: Task 2's renamed packages.
- Produces: `RELAY_VERSION: string` (exported from `cli/version.ts`); publishable tarballs containing `dist/`, `src/store/migrations/*.sql`, `scripts/`.

- [ ] **Step 1: Write the failing version-source test**

Create `packages/server/src/cli/version.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { RELAY_VERSION } from './version.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

describe('RELAY_VERSION', () => {
  it('equals the package.json version (single source of truth)', () => {
    expect(RELAY_VERSION).toBe(pkg.version);
  });
  it('is a real semver, not the 0.0.0 placeholder', () => {
    expect(RELAY_VERSION).not.toBe('0.0.0');
    expect(RELAY_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
```

- [ ] **Step 2: Run it — fails (module + version missing)**

Run: `pnpm -F @relay/relay test src/cli/version.test.ts`
Expected: FAIL — `Cannot find module './version.js'` (and version is still `0.0.0`).

- [ ] **Step 3: Set versions to 0.1.0 and add publish metadata**

In `packages/protocol/package.json`, remove `"private": true` and set:
```json
  "version": "0.1.0",
  "description": "Shared Zod schemas and TypeScript types for the Relay REST and WebSocket wire protocol.",
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/TechGardenCode/relay.git", "directory": "packages/protocol" },
  "publishConfig": { "access": "public" },
  "files": ["dist"],
```
Add `"prepack": "tsc -b --force"` to its `"scripts"`.

In `packages/server/package.json`, remove `"private": true` and set:
```json
  "version": "0.1.0",
  "description": "Relay — self-hosted server, CLI, and attach client for remote-controlling Claude Code agent sessions.",
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/TechGardenCode/relay.git", "directory": "packages/server" },
  "homepage": "https://github.com/TechGardenCode/relay#readme",
  "bugs": { "url": "https://github.com/TechGardenCode/relay/issues" },
  "publishConfig": { "access": "public" },
  "files": ["dist", "src/store/migrations", "scripts"],
```
Add to its `"scripts"`: `"prepack": "tsc -b --force"` and `"postinstall": "node scripts/postinstall.mjs"` (the script lands in Task 4 — add the wiring now so metadata is complete; Task 4's commit adds the file).

> NOTE: `src/store/migrations` in `files` is load-bearing — `tsc` does not copy `.sql` into `dist/`, and `resolveMigrationsDir` (`cli/migrations-dir.ts`) falls back to `<pkgroot>/src/store/migrations`. Without this, a fresh global install 500s on first DB access. Task 9's `npm pack` smoke guards it.

- [ ] **Step 4: Create the version resolver**

Create `packages/server/src/cli/version.ts`:
```ts
// Single source of truth for the CLI version: read from package.json so a
// release bump (`npm version`) never requires editing code. Runtime-resolved
// (not a compile-time JSON import) to avoid tsc rootDir errors — works from
// both `src/cli/` (dev/tests) and `dist/cli/` (published), each resolving to
// its own package root's package.json.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

export const RELAY_VERSION: string = pkg.version;
```

- [ ] **Step 5: Route commander + doctor through it**

In `packages/server/src/cli/relay.ts`, import and use it for the program version. Add near the top imports:
```ts
import { RELAY_VERSION } from './version.js';
```
and replace the hardcoded version string passed to commander's `.version(...)` with `RELAY_VERSION` (grep for `.version(` to find the call).

In `packages/server/src/cli/doctor.ts`, replace:
```ts
const RELAY_CLI_VERSION = '0.0.0';
```
with:
```ts
import { RELAY_VERSION } from './version.js';
```
and update the default on line ~120 to `const version = deps.version ?? RELAY_VERSION;` (remove the now-unused `RELAY_CLI_VERSION` const).

- [ ] **Step 6: Run the version test — passes**

Run: `pnpm -F @relay/relay test src/cli/version.test.ts`
Expected: PASS (both assertions).

- [ ] **Step 7: Verify the built CLI reports 0.1.0 and the tarball is correct**

Run:
```bash
pnpm build
node packages/server/dist/cli/relay.js --version
cd packages/server && pnpm pack --dry-run 2>&1 | grep -E 'migrations/.*\.sql|dist/cli/relay.js' | head; cd -
```
Expected: `--version` prints `0.1.0`; dry-run pack lists `dist/cli/relay.js` and `src/store/migrations/0001_*.sql` (+ any later migrations).

- [ ] **Step 8: Full suite + commit**

Run: `pnpm typecheck && pnpm test`
Expected: clean; all pass.
```bash
git add -A
git commit -m "feat(dist): publish metadata + version-from-package.json for both packages"
```

---

### Task 4: Native-dep repair/verify postinstall

Ship a postinstall that runs on the end user's machine: re-chmod the macOS spawn-helper (bulletproofs the rare bit-drop) and verify both native addons load, printing precise guidance on failure without ever aborting the install.

**Files:**
- Create: `packages/server/scripts/postinstall.mjs`
- Create: `packages/server/src/cli/postinstall.test.ts`
- (Wiring `"postinstall"` in `package.json` already added in Task 3 Step 3.)

**Interfaces:**
- Consumes: Task 3's package with `"postinstall": "node scripts/postinstall.mjs"`.
- Produces: an install-time side effect only; exits 0 unconditionally.

- [ ] **Step 1: Write the failing smoke test**

Create `packages/server/src/cli/postinstall.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts');

describe('postinstall.mjs', () => {
  it('exits 0 and reports no addon load failure on a supported platform', () => {
    const out = execFileSync('node', [join(scriptDir, 'postinstall.mjs')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // node-pty + better-sqlite3 are installed in the workspace, so no WARNING.
    expect(out).not.toMatch(/WARNING/);
  });
});
```
(`execFileSync` throws on non-zero exit, so a passing call already asserts exit 0.)

- [ ] **Step 2: Run it — fails (script missing)**

Run: `pnpm -F @relay/relay test src/cli/postinstall.test.ts`
Expected: FAIL — `ENOENT ... scripts/postinstall.mjs`.

- [ ] **Step 3: Write the postinstall script**

Create `packages/server/scripts/postinstall.mjs`:
```js
// Per D-npm / ND-node-pty: repair + verify native addons after `npm i`.
// (1) Re-chmod node-pty's macOS spawn-helper — npm usually preserves the exec
//     bit, but some installers/CI drop it. No-op off darwin.
// (2) Verify node-pty + better-sqlite3 load; on failure print guidance and
//     exit 0. Never abort the install: a hard failure would leave `relay`
//     uninstalled and undiagnosable — `relay doctor` is the runtime gate.
import { chmodSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function chmodSpawnHelper() {
  if (process.platform !== 'darwin') return;
  try {
    const ptyRoot = dirname(require.resolve('node-pty/package.json'));
    const helper = join(ptyRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper');
    if (existsSync(helper)) {
      chmodSync(helper, 0o755);
      process.stdout.write(`[relay postinstall] chmod +x ${helper}\n`);
    }
  } catch (err) {
    process.stdout.write(`[relay postinstall] spawn-helper chmod skipped: ${err.message}\n`);
  }
}

function verifyAddon(name) {
  try {
    require(name);
  } catch (err) {
    process.stderr.write(
      `\n[relay postinstall] WARNING: '${name}' failed to load:\n  ${err.message}\n` +
        `  This platform may need a C++ toolchain (compiler, make, python3),\n` +
        `  or is unsupported (Windows and Alpine/musl are experimental).\n` +
        `  Run 'relay doctor' after install for a full diagnosis.\n\n`,
    );
  }
}

chmodSpawnHelper();
verifyAddon('node-pty');
verifyAddon('better-sqlite3');
process.exit(0);
```

- [ ] **Step 4: Run the test — passes**

Run: `pnpm -F @relay/relay test src/cli/postinstall.test.ts`
Expected: PASS.

- [ ] **Step 5: Manually confirm the repair path fires on macOS**

Run: `node packages/server/scripts/postinstall.mjs`
Expected (macOS): prints `[relay postinstall] chmod +x .../darwin-arm64/spawn-helper`; no `WARNING`. (Linux: silent chmod skip, no WARNING.)

- [ ] **Step 6: Commit**

```bash
git add packages/server/scripts/postinstall.mjs packages/server/src/cli/postinstall.test.ts
git commit -m "feat(dist): postinstall native-dep repair + load verification"
```

---

### Task 5: `relay doctor` native-addons probe

Extend the existing `relay doctor` (ND-35) with a probe that confirms `node-pty` and `better-sqlite3` load — turning a broken native install into an actionable line instead of a first-session crash. Loading the addon (not opening a DB) keeps ND-18's thin-client posture.

**Files:**
- Modify: `packages/server/src/cli/doctor.ts`
- Modify: `packages/server/src/cli/doctor.test.ts`

**Interfaces:**
- Consumes: the `DoctorDeps` / `DoctorCheck` shapes already in `doctor.ts`.
- Produces: a new `native-deps` check + an injectable `nativeAddonsLoad?: () => { ok: boolean; failed: string[] }` dep on `DoctorDeps`.

- [ ] **Step 1: Write the failing test**

Add to `packages/server/src/cli/doctor.test.ts`:
```ts
it('reports native-deps ok when addons load', async () => {
  const report = await runDoctor({ ...baseDeps, nativeAddonsLoad: () => ({ ok: true, failed: [] }) });
  const check = report.checks.find((c) => c.name === 'native-deps');
  expect(check?.status).toBe('ok');
});

it('fails native-deps with a remediation when an addon does not load', async () => {
  const report = await runDoctor({
    ...baseDeps,
    nativeAddonsLoad: () => ({ ok: false, failed: ['node-pty'] }),
  });
  const check = report.checks.find((c) => c.name === 'native-deps');
  expect(check?.status).toBe('fail');
  expect(check?.detail).toMatch(/node-pty/);
  expect(check?.remediation).toBeDefined();
  expect(report.ok).toBe(false);
});
```
(Use whatever `baseDeps` object the existing specs pass — mirror the top of the file. If none exists, inline the full injected deps: `home`, `claudeOnPath`, `oauthCredentialPresent`, `probeServer` stubs, as the other specs do.)

- [ ] **Step 2: Run — fails**

Run: `pnpm -F @relay/relay test src/cli/doctor.test.ts`
Expected: FAIL — no `native-deps` check (returns `undefined`).

- [ ] **Step 3: Add the probe to doctor.ts**

Add the injectable dep to `DoctorDeps`:
```ts
  /** Whether the native addons (node-pty, better-sqlite3) load. Injected in tests. */
  nativeAddonsLoad?: () => { ok: boolean; failed: string[] };
```
Add the default probe (near `defaultProbeServer`):
```ts
// Per D-npm: a *load* check (require the addon), not a DB open — compatible
// with ND-18's thin-client posture. Catches ABI/prebuild mismatches that would
// otherwise crash at first `POST /sessions`.
function defaultNativeAddonsLoad(): { ok: boolean; failed: string[] } {
  const require = createRequire(import.meta.url);
  const failed: string[] = [];
  for (const name of ['node-pty', 'better-sqlite3']) {
    try {
      require(name);
    } catch {
      failed.push(name);
    }
  }
  return { ok: failed.length === 0, failed };
}
```
Add `import { createRequire } from 'node:module';` to the imports. In `runDoctor`, resolve the dep and push the check (place it after the `storage` check, before `server`):
```ts
  const nativeAddonsLoad = deps.nativeAddonsLoad ?? defaultNativeAddonsLoad;
  const native = nativeAddonsLoad();
  if (native.ok) {
    checks.push({ name: 'native-deps', status: 'ok', detail: 'node-pty + better-sqlite3 load' });
  } else {
    checks.push({
      name: 'native-deps',
      status: 'fail',
      detail: `native addon(s) failed to load: ${native.failed.join(', ')}`,
      remediation:
        'reinstall with `npm i -g @techgardencode/relay`; if it persists your platform may need a C++ toolchain (Windows/musl are experimental)',
    });
  }
```

- [ ] **Step 4: Run — passes**

Run: `pnpm -F @relay/relay test src/cli/doctor.test.ts`
Expected: PASS (both new specs + all existing doctor specs).

- [ ] **Step 5: Full suite + commit**

Run: `pnpm typecheck && pnpm test`
Expected: clean; all pass.
```bash
git add packages/server/src/cli/doctor.ts packages/server/src/cli/doctor.test.ts
git commit -m "feat(doctor): native-addon load probe (fail loud, not at first session)"
```

---

### Task 6: CI validation workflow

Add `.github/workflows/ci.yml`: full validate + test on Ubuntu + macOS (Node 22), plus a non-blocking Windows build leg.

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the `pnpm` scripts (`typecheck`/`lint`/`format:check`/`build`/`test`) and `packageManager` field.
- Produces: green checks on PRs/pushes.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
permissions:
  contents: read
jobs:
  validate:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      # Repair the macOS spawn-helper exec bit (no-op on Linux) so node-pty specs run.
      - run: node packages/server/scripts/fix-pty.mjs
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm build
      - run: pnpm test
  windows-build:
    runs-on: windows-latest
    continue-on-error: true # Windows is experimental (D-npm); visibility, not a gate.
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm build
```

- [ ] **Step 2: Validate workflow syntax**

Run:
```bash
node -e "require('yaml') ? 0 : 0" 2>/dev/null; python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ci.yml parses')"
```
Expected: `ci.yml parses`. (If `actionlint` is installed, run `actionlint .github/workflows/ci.yml` — expect no errors.)

- [ ] **Step 3: Locally reproduce the exact CI job to prove it's green**

Run:
```bash
pnpm install --frozen-lockfile && node packages/server/scripts/fix-pty.mjs && \
  pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test
```
Expected: every step exits 0; tests pass. (If `--frozen-lockfile` errors, the lockfile is stale — run `pnpm install` and re-commit `pnpm-lock.yaml`.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: validate (typecheck/lint/format/build/test) on ubuntu+macos, windows build-only"
```

---

### Task 7: Release/publish workflow

Add `.github/workflows/release.yml`: on a `v*` tag, build + test, then publish both public packages with provenance. Structured so a Docker job appends later.

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `NPM_TOKEN` repo secret (operator sets it — Task 9); the `0.1.0` versions from Task 3.
- Produces: published `@techgardencode/relay` + `@techgardencode/protocol` on npm.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/release.yml`:
```yaml
name: Release
on:
  push:
    tags: ['v*']
permissions:
  contents: read
  id-token: write # npm provenance attestation
jobs:
  publish-npm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test
      # Publishes every non-private workspace package (the two @techgardencode/*)
      # in dependency order. --no-git-checks: tag checkout is detached HEAD.
      - run: pnpm -r publish --access public --provenance --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
  # docker-publish: appended when Docker distribution lands (Track 8) — same tag.
```

- [ ] **Step 2: Validate syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('release.yml parses')"`
Expected: `release.yml parses`.

- [ ] **Step 3: Dry-run the publish shape locally (no network publish)**

Run:
```bash
pnpm build && pnpm -r publish --dry-run --no-git-checks 2>&1 | grep -E '@techgardencode/(relay|protocol)|would publish|Tarball' | head
```
Expected: shows both `@techgardencode/relay` and `@techgardencode/protocol` as would-be-published at `0.1.0`; `relay-extension` is NOT listed (it stays private). If the extension appears, re-check its `"private": true`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: publish both packages to npm with provenance on v* tag"
```

---

### Task 8: Docs + decision log

Update the user-facing install/upgrade docs to the real npm path and file the decisions this effort locks in (repo is decision-log-driven).

**Files:**
- Modify: `README.md` (Quick install + Phase-status banner)
- Modify: `docs/deployment.md` (upgrade loop, Linux libc note, Windows-experimental note)
- Create (via `decision-log` skill): `docs/decisions/D-NN-npm-distribution-posture.md` and `docs/decisions/ND-NN-node-pty-linux-prebuild.md`
- Modify: `docs/build-plan.md` (Track 8 / 6J row — npm slice now in progress on this branch)

**Interfaces:**
- Consumes: everything above.
- Produces: the real `D-NN`/`ND-NN` IDs that replace the `D-npm`/`ND-node-pty` placeholders in code comments.

- [ ] **Step 1: File the decisions (use the decision-log skill)**

Invoke the `decision-log` skill to create two entries (it computes the next free IDs and follows the template/propagation protocol):
- **D-NN — "npm distribution posture."** `@techgardencode` public user scope; dual-package lockstep; tag-triggered release; hybrid native-dep strategy (prebuilds where free + auto-compile fallback); Windows best-effort. Advances [D-16](../decisions/D-16-phase-1-ships-without-distribution.md) for the npm slice only; Docker/Compose/Helm remain deferred to Track 8. Affects: `docs/build-plan.md`, `docs/prd/06-distribution.md`, `README.md`, `docs/deployment.md`.
- **ND-NN — "node-pty Linux prebuild resolution."** Adopted `node-pty@1.2.0-beta.14` (ships `prebuilds/linux-{x64,arm64}`); vendor-in-CI fallback unused. Affects: `packages/server/package.json`, `packages/server/scripts/postinstall.mjs`.

- [ ] **Step 2: Replace the code-comment placeholders with the real IDs**

Run:
```bash
grep -rn "D-npm\|ND-node-pty" packages
```
Replace each `D-npm` / `ND-node-pty` with the IDs the skill assigned (in `scripts/postinstall.mjs` and `cli/doctor.ts`).

- [ ] **Step 3: Update README Quick install + banner**

In `README.md`: change the package name in the install snippets to `@techgardencode/relay`; update the Phase-status banner — the npm path is now real (drop "not yet published to npm"); keep honest caveats (Windows experimental; Alpine/musl may compile). Add the one-line upgrade loop: `npm i -g @techgardencode/relay@latest && relay doctor`.

- [ ] **Step 4: Update deployment doc**

In `docs/deployment.md`: add the upgrade-and-verify one-liner; a note that Linux install is zero-toolchain on glibc x64/arm64 and compiles on musl/exotic (needs build-essential/python3); a Windows-experimental note. Docker sections stay "not yet published."

- [ ] **Step 5: Update the build-plan tracker**

In `docs/build-plan.md`: annotate the Track 8 / `6J` row — the **npm slice** is in progress on `worktree-feat+npm-distribution` (link this plan); Docker/Compose/Helm and extension-marketplace remain deferred.

- [ ] **Step 6: Verify links/citations resolve, then commit**

Run: `pnpm format:check` (docs excluded from Prettier, but keeps the hook happy) and eyeball the new decision files render.
```bash
git add -A
git commit -m "docs(dist): npm install/upgrade docs + D-NN/ND-NN decisions; build-plan Track 8 update"
```

---

### Task 9: Acceptance — clean-room + VM smoke, then operator publish gate

Prove a fresh global install works with no repo and no manual build, on macOS and on the Ubuntu VM, using the actual tarball. Then hand off the operator-gated first publish. **No `git push` and no real `npm publish` happen inside this plan.**

**Files:** none (verification + handoff).

**Interfaces:**
- Consumes: all prior tasks (green suite, publish metadata, workflows).
- Produces: a verified tarball + a written operator handoff checklist.

- [ ] **Step 1: Build + pack both packages to a scratch dir**

Run:
```bash
pnpm build
PACKDIR=$(mktemp -d)
( cd packages/protocol && pnpm pack --pack-destination "$PACKDIR" )
( cd packages/server && pnpm pack --pack-destination "$PACKDIR" )
ls -1 "$PACKDIR"
echo "PACKDIR=$PACKDIR"
```
Expected: two `.tgz` files (`techgardencode-protocol-0.1.0.tgz`, `techgardencode-relay-0.1.0.tgz`).

- [ ] **Step 2: Confirm the server tarball contains the migrations (the §5 catch)**

Run: `tar tzf "$PACKDIR"/techgardencode-relay-0.1.0.tgz | grep -E 'store/migrations/.*\.sql|dist/cli/relay.js'`
Expected: lists `package/src/store/migrations/0001_*.sql` (+ later) and `package/dist/cli/relay.js`. If migrations are missing, fix `files` in Task 3 and re-pack.

- [ ] **Step 3: Clean-room global install on macOS (no repo, no build tools on PATH)**

Run:
```bash
CLEAN=$(mktemp -d)
npm install -g --prefix "$CLEAN" \
  "$PACKDIR"/techgardencode-protocol-0.1.0.tgz \
  "$PACKDIR"/techgardencode-relay-0.1.0.tgz
"$CLEAN"/bin/relay --version
HOME=$(mktemp -d) "$CLEAN"/bin/relay init >/dev/null && HOME=... "$CLEAN"/bin/relay doctor
```
For the doctor line, run it with a throwaway HOME that `relay init` populated:
```bash
SMOKE_HOME=$(mktemp -d); "$CLEAN"/bin/relay init >/dev/null 2>&1 || true
HOME="$SMOKE_HOME" "$CLEAN"/bin/relay init && HOME="$SMOKE_HOME" "$CLEAN"/bin/relay doctor || true
```
Expected: `relay --version` → `0.1.0`; the postinstall ran during `npm install -g` (chmod line on macOS, no WARNING); `relay doctor` shows `native-deps: ok`, `relay-home: ok`, `storage: ok` (credential/server checks may WARN/FAIL in the throwaway home — that's fine; `native-deps` is what this task proves).

- [ ] **Step 4: VM (Linux) clean-room smoke — operator-authorized**

Use the `vm-e2e` / `relay-deploy` skill target (`techgardencode@10.0.60.221`). Copy the two `.tgz` to the VM, `npm install -g --prefix ~/relaytest ./*.tgz`, then `~/relaytest/bin/relay --version` and `relay doctor`. Expected: install needs **no** `build-essential` (node-pty Linux prebuild + better-sqlite3 prebuild); `--version` → `0.1.0`; `native-deps: ok`. This is the real proof that Task 1 delivered zero-build-tools on Linux. If SSH isn't authorized this session, mark this step blocked and surface it in the handoff.

- [ ] **Step 5: Write the operator handoff checklist**

Print/record the operator-only steps (these are NOT run by the agent):
1. On npmjs.com: create an **automation** access token; add it as the GitHub repo secret `NPM_TOKEN`.
2. Push the branch + open a PR (CI must go green on ubuntu+macos).
3. Merge to `main`.
4. `git tag v0.1.0 && git push origin v0.1.0` → `release.yml` publishes both packages.
5. Verify: `npm view @techgardencode/relay version` → `0.1.0`; on any machine `npm i -g @techgardencode/relay@latest && relay doctor`.

- [ ] **Step 6: Final full green + commit the plan-completion pointer**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all clean/green.
```bash
git add -A
git commit -m "chore(dist): acceptance smoke verified (mac clean-room + tarball); operator publish handoff"
```
STOP here. Do not push or publish — hand the checklist from Step 5 to the operator.

---

## Self-Review

**Spec coverage:**
- §2 rename → Task 2. §2 publish metadata + migrations-in-`files` → Task 3. §2 lockstep `workspace:^` → Task 2/3.
- §4 D1 `@techgardencode` public → Task 3 (`publishConfig.access: public`, `--access public`). D2 protocol-as-package → Tasks 2–3. D3 tag trigger → Task 7. D4 hybrid native → Tasks 1/4/5. D5 Windows best-effort → Task 6 (`continue-on-error`) + Task 8 docs.
- §6.2 node-pty Linux → Task 1. §6.3 postinstall → Task 4. §6.4 doctor guard → Task 5.
- §7.1 ci.yml → Task 6. §7.2 release.yml → Task 7. §7.3 operator prereqs → Task 9 Step 5.
- §8 upgrade loop → Task 8 (docs). §9 docs → Task 8. §10 acceptance (npm pack clean-room + VM) → Task 9. §11 decisions → Task 8. §12 worktree → already done; sequencing matches Tasks 1→9.

**Placeholder scan:** `D-npm`/`ND-node-pty` are intentional, resolved in Task 8 Step 2. No `TBD`/`TODO`/"handle edge cases". All code steps show full code.

**Type consistency:** `RELAY_VERSION` (string) defined in Task 3, consumed in Tasks 3/5. `DoctorDeps.nativeAddonsLoad: () => { ok: boolean; failed: string[] }` defined and consumed consistently in Task 5. `resolveMigrationsDir` referenced matches `cli/migrations-dir.ts`. Package specifier `@techgardencode/protocol` consistent across Tasks 2–9.

---

## Execution note

Task 1's premise (node-pty beta ships Linux prebuilds) is **verified** against the real published tarball, so the vendor-in-CI fallback (spec §6.2 step 2) is very unlikely. If Task 1 Step 1's evidence check ever fails, stop and re-plan Task 1 as the vendor path before continuing — every later task assumes zero-build-tools Linux holds.
