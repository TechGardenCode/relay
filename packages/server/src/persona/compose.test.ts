import { describe, expect, it } from 'vitest';

import { composeByName } from './compose.js';
import type { PersonaInput } from './types.js';

function tenant(name: string, description = `tenant-${name}`): PersonaInput {
  return {
    persona: { schemaVersion: 1, name, description },
    source: 'tenant',
    filePath: `/fake/tenant/${name}.yaml`,
  };
}

function project(name: string, description = `project-${name}`): PersonaInput {
  return {
    persona: { schemaVersion: 1, name, description },
    source: 'project',
    filePath: `/fake/project/${name}.yaml`,
  };
}

describe('composeByName', () => {
  it('returns an empty map for empty inputs', () => {
    expect(composeByName([])).toEqual(new Map());
    expect(composeByName([], [])).toEqual(new Map());
  });

  it('returns tenant entries unchanged when project is omitted', () => {
    const composed = composeByName([tenant('dev'), tenant('infra')]);
    expect(composed.size).toBe(2);
    expect(composed.get('dev')?.source).toBe('tenant');
    expect(composed.get('infra')?.source).toBe('tenant');
  });

  it('returns project entries when tenant is empty', () => {
    const composed = composeByName([], [project('product')]);
    expect(composed.size).toBe(1);
    expect(composed.get('product')?.source).toBe('project');
  });

  it('project entries replace tenant entries by name (full-struct replacement, no merge)', () => {
    const t: PersonaInput = {
      persona: {
        schemaVersion: 1,
        name: 'test',
        description: 'tenant',
        skills: ['tenant-skill'],
      },
      source: 'tenant',
      filePath: '/fake/tenant/test.yaml',
    };
    const p: PersonaInput = {
      persona: { schemaVersion: 1, name: 'test', description: 'project' },
      source: 'project',
      filePath: '/fake/project/test.yaml',
    };
    const composed = composeByName([t], [p]);
    expect(composed.size).toBe(1);
    const winner = composed.get('test');
    expect(winner?.source).toBe('project');
    expect(winner?.persona.description).toBe('project');
    // No per-field merge: tenant's skills do NOT survive on the project record.
    expect(winner?.persona.skills).toBeUndefined();
  });

  it('disjoint sets union: tenant-only, project-only, and shared names coexist', () => {
    const composed = composeByName(
      [tenant('dev'), tenant('infra'), tenant('test')],
      [project('dev'), project('product')],
    );
    expect(composed.size).toBe(4);
    expect(composed.get('dev')?.source).toBe('project');
    expect(composed.get('infra')?.source).toBe('tenant');
    expect(composed.get('test')?.source).toBe('tenant');
    expect(composed.get('product')?.source).toBe('project');
  });

  it('iteration order is "tenant insertions first, project overrides keep tenant slot"', () => {
    // Map preserves insertion order. Tenant inserts dev first, then infra.
    // Project overrides dev (slot kept where it was), adds product at the end.
    const composed = composeByName(
      [tenant('dev'), tenant('infra')],
      [project('dev'), project('product')],
    );
    expect([...composed.keys()]).toEqual(['dev', 'infra', 'product']);
    expect(composed.get('dev')?.source).toBe('project');
  });
});
