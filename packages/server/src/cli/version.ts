// Single source of truth for the CLI version: read from package.json so a
// release bump (`npm version`) never requires editing code. Runtime-resolved
// (not a compile-time JSON import) to avoid tsc rootDir errors — works from
// both `src/cli/` (dev/tests) and `dist/cli/` (published), each resolving to
// its own package root's package.json.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

export const RELAY_VERSION: string = pkg.version;
