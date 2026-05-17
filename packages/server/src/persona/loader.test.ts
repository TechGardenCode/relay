import { mkdtempSync, rmSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadPersonasFromDirectory } from './loader.js';
import type { PersonaLoadReason } from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, '../../test/fixtures/personas');
const DEFAULTS = resolve(HERE, '../../personas/defaults');

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'relay-persona-loader-'));
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe('loadPersonasFromDirectory — valid fixtures', () => {
  it('loads all four valid fixtures with source label and absolute file path', () => {
    const result = loadPersonasFromDirectory(join(FIXTURES, 'valid'), 'tenant');
    expect(result.invalid).toEqual([]);
    expect(result.valid).toHaveLength(4);
    const names = result.valid.map((v) => v.persona.name).sort();
    expect(names).toEqual(['empty-skills', 'maximal', 'minimal', 'null-skills']);
    for (const entry of result.valid) {
      expect(entry.source).toBe('tenant');
      expect(entry.filePath.endsWith('.yaml')).toBe(true);
    }
  });
});

describe('loadPersonasFromDirectory — invalid fixtures', () => {
  it('surfaces one error per invalid fixture with the right reason', () => {
    const result = loadPersonasFromDirectory(join(FIXTURES, 'invalid'), 'tenant');
    expect(result.valid).toEqual([]);
    expect(result.invalid).toHaveLength(8);

    const byStem = new Map<string, PersonaLoadReason>();
    for (const err of result.invalid) {
      const stem = err.filePath.split('/').pop()?.replace('.yaml', '') ?? '';
      byStem.set(stem, err.reason);
    }

    expect(byStem.get('parse-error')).toBe('parse_error');
    expect(byStem.get('missing-required')).toBe('missing_required');
    expect(byStem.get('unsupported-version')).toBe('unsupported_schema_version');
    expect(byStem.get('bad-name-format')).toBe('name_format');
    expect(byStem.get('stem-mismatch')).toBe('name_stem_mismatch');
    expect(byStem.get('list-type')).toBe('list_type');
    expect(byStem.get('model-type')).toBe('model_type');
    expect(byStem.get('extra-fields')).toBe('extra_fields');
  });

  it('attaches a non-empty detail string to every error', () => {
    const result = loadPersonasFromDirectory(join(FIXTURES, 'invalid'), 'tenant');
    for (const err of result.invalid) {
      expect(err.detail.length).toBeGreaterThan(0);
    }
  });
});

describe('loadPersonasFromDirectory — directory handling', () => {
  it('returns empty result (no error) when the directory does not exist', () => {
    const result = loadPersonasFromDirectory(join(workdir, 'no-such-dir'), 'project');
    expect(result).toEqual({ valid: [], invalid: [] });
  });

  it('returns empty result for an empty directory', () => {
    const empty = join(workdir, 'empty');
    mkdirSync(empty);
    const result = loadPersonasFromDirectory(empty, 'tenant');
    expect(result).toEqual({ valid: [], invalid: [] });
  });

  it('ignores non-.yaml files', () => {
    const mixed = join(workdir, 'mixed');
    mkdirSync(mixed);
    writeFileSync(join(mixed, 'dev.yaml'), 'schemaVersion: 1\nname: dev\n');
    writeFileSync(join(mixed, 'README.md'), '# notes\n');
    writeFileSync(join(mixed, 'tokens.json'), '{}');
    const result = loadPersonasFromDirectory(mixed, 'tenant');
    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toHaveLength(0);
    expect(result.valid[0]?.persona.name).toBe('dev');
  });

  it('surfaces io_error on an unreadable file (POSIX permissions)', () => {
    if (platform() === 'win32') return;
    const unread = join(workdir, 'unread');
    mkdirSync(unread);
    const file = join(unread, 'dev.yaml');
    writeFileSync(file, 'schemaVersion: 1\nname: dev\n');
    chmodSync(file, 0o000);
    try {
      const result = loadPersonasFromDirectory(unread, 'tenant');
      expect(result.valid).toEqual([]);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0]?.reason).toBe('io_error');
    } finally {
      chmodSync(file, 0o600);
    }
  });

  it('a malformed file does not block sibling files from loading (per 09-persona-schema.md §4)', () => {
    const mixed = join(workdir, 'mixed-fail');
    mkdirSync(mixed);
    writeFileSync(join(mixed, 'dev.yaml'), 'schemaVersion: 1\nname: dev\n');
    writeFileSync(join(mixed, 'broken.yaml'), 'schemaVersion: not-a-number\nname: broken\n');
    const result = loadPersonasFromDirectory(mixed, 'tenant');
    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toHaveLength(1);
    expect(result.valid[0]?.persona.name).toBe('dev');
  });
});

describe('1A defaults — regression smoke test', () => {
  it('loads all seven default personas from packages/server/personas/defaults/ with zero errors', () => {
    const result = loadPersonasFromDirectory(DEFAULTS, 'tenant');
    expect(result.invalid).toEqual([]);
    const names = result.valid.map((v) => v.persona.name).sort();
    expect(names).toEqual(['architect', 'design', 'dev', 'infra', 'product', 'review', 'test']);
  });
});
