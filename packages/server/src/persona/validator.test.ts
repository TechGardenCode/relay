import { describe, expect, it } from 'vitest';

import { validatePersona } from './validator.js';

describe('validatePersona', () => {
  it('accepts a minimal persona (schemaVersion + name) and surfaces it typed', () => {
    const result = validatePersona({ schemaVersion: 1, name: 'minimal' }, 'minimal');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.persona.name).toBe('minimal');
      expect(result.persona.schemaVersion).toBe(1);
    }
  });

  it('accepts a maximal persona with every optional field set', () => {
    const result = validatePersona(
      {
        schemaVersion: 1,
        name: 'maximal',
        description: 'desc',
        systemPrompt: 'prompt',
        skills: ['s1', 's2'],
        mcpServers: ['m1'],
        model: 'claude-sonnet-4-6',
      },
      'maximal',
    );
    expect(result.ok).toBe(true);
  });

  it('treats null skills/mcpServers as valid (equivalent to omitted)', () => {
    const result = validatePersona(
      { schemaVersion: 1, name: 'null-skills', skills: null, mcpServers: null },
      'null-skills',
    );
    expect(result.ok).toBe(true);
  });

  it('treats empty skills list ([]) as valid', () => {
    const result = validatePersona(
      { schemaVersion: 1, name: 'empty-skills', skills: [] },
      'empty-skills',
    );
    expect(result.ok).toBe(true);
  });

  it('rejects non-object root as parse_error', () => {
    const result = validatePersona('just a string', 'whatever');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('parse_error');
  });

  it('rejects array root as parse_error', () => {
    const result = validatePersona([1, 2, 3], 'whatever');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('parse_error');
  });

  it('rejects null root as parse_error', () => {
    const result = validatePersona(null, 'whatever');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('parse_error');
  });

  it('reports missing schemaVersion as missing_required (not unsupported_schema_version)', () => {
    const result = validatePersona({ name: 'no-version' }, 'no-version');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing_required');
  });

  it('reports missing name as missing_required (not name_format)', () => {
    const result = validatePersona({ schemaVersion: 1 }, 'no-name');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing_required');
  });

  it('reports null schemaVersion as missing_required', () => {
    const result = validatePersona({ schemaVersion: null, name: 'x' }, 'x');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing_required');
  });

  it('rejects schemaVersion 99 as unsupported_schema_version', () => {
    const result = validatePersona(
      { schemaVersion: 99, name: 'unsupported-version' },
      'unsupported-version',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unsupported_schema_version');
  });

  it('rejects schemaVersion as string ("1") as unsupported_schema_version', () => {
    const result = validatePersona(
      { schemaVersion: '1', name: 'string-version' },
      'string-version',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unsupported_schema_version');
  });

  it('rejects non-kebab name as name_format', () => {
    const result = validatePersona({ schemaVersion: 1, name: 'Bad_Name' }, 'bad-name-format');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('name_format');
  });

  it('rejects a valid kebab name that does not match the stem as name_stem_mismatch', () => {
    const result = validatePersona({ schemaVersion: 1, name: 'different-name' }, 'stem-mismatch');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('name_stem_mismatch');
  });

  it('rejects skills as a string as list_type', () => {
    const result = validatePersona(
      { schemaVersion: 1, name: 'list-type', skills: 'just-one' },
      'list-type',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('list_type');
  });

  it('rejects mcpServers as a mapping as list_type', () => {
    const result = validatePersona(
      { schemaVersion: 1, name: 'list-type', mcpServers: { github: true } },
      'list-type',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('list_type');
  });

  it('rejects model as a number as model_type', () => {
    const result = validatePersona(
      { schemaVersion: 1, name: 'model-type', model: 42 },
      'model-type',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('model_type');
  });

  it('rejects unknown top-level fields as extra_fields (strict mode)', () => {
    const result = validatePersona(
      { schemaVersion: 1, name: 'extra-fields', favoriteColor: 'blue' },
      'extra-fields',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('extra_fields');
  });
});
