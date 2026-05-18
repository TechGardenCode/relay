// Resolve the directory holding the .sql migration files. The build does not
// copy them into `dist/` yet (6J owns the distribution shape), so production
// `relay init` / `relay server` invocations have to fall back to the source
// tree when the dist-relative path is empty. Searches, in order:
//
//   1. <cliDir>/../store/migrations         (post-6J expected location)
//   2. <cliDir>/../../src/store/migrations  (dev: `dist/cli/` → `src/store/migrations`)
//   3. <cliDir>/../../../src/store/migrations  (when distributed `dist/` lives one level deeper)
//
// Throws a clear error naming all attempts on miss rather than letting the
// store layer surface a bare ENOENT.

import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATION_FILE_REGEX = /^\d{4}_.+\.sql$/;

function looksLikeMigrationsDir(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    return readdirSync(path).some((entry) => MIGRATION_FILE_REGEX.test(entry));
  } catch {
    return false;
  }
}

export function resolveMigrationsDir(callerUrl: string): string {
  const here = dirname(fileURLToPath(callerUrl));
  const candidates = [
    join(here, '..', 'store', 'migrations'),
    join(here, '..', '..', 'src', 'store', 'migrations'),
    join(here, '..', '..', '..', 'src', 'store', 'migrations'),
  ];
  for (const candidate of candidates) {
    if (looksLikeMigrationsDir(candidate)) return candidate;
  }
  throw new Error(
    `relay: could not locate the migrations directory. Searched:\n${candidates
      .map((c) => `  ${c}`)
      .join('\n')}`,
  );
}
