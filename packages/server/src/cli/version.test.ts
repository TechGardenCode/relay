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
