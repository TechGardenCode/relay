// Per D-19 / ND-45: repair + verify native addons after `npm i`.
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
    const helper = join(
      ptyRoot,
      'prebuilds',
      `${process.platform}-${process.arch}`,
      'spawn-helper',
    );
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
