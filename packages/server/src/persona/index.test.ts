import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadAll } from './index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPOSE_FIXTURES = resolve(HERE, '../../test/fixtures/personas/compose');

describe('loadAll', () => {
  it('loads tenant-only when projectDir is omitted', () => {
    const result = loadAll({ tenantDir: `${COMPOSE_FIXTURES}/tenant` });
    expect(result.errors).toEqual([]);
    expect(result.personas.size).toBe(3);
    expect(result.personas.get('dev')?.source).toBe('tenant');
    expect(result.personas.get('infra')?.source).toBe('tenant');
    expect(result.personas.get('test')?.source).toBe('tenant');
  });

  it('composes tenant + project with project overriding by name', () => {
    const result = loadAll({
      tenantDir: `${COMPOSE_FIXTURES}/tenant`,
      projectDir: `${COMPOSE_FIXTURES}/project`,
    });
    expect(result.errors).toEqual([]);
    expect(result.personas.size).toBe(4);

    const dev = result.personas.get('dev');
    expect(dev?.source).toBe('project');
    expect(dev?.persona.description).toContain('PROJECT');

    const infra = result.personas.get('infra');
    expect(infra?.source).toBe('tenant');

    const test = result.personas.get('test');
    expect(test?.source).toBe('project');
    expect(test?.persona.skills).toBeUndefined();

    const product = result.personas.get('product');
    expect(product?.source).toBe('project');
  });

  it('tolerates a missing projectDir without erroring (common case for projects with no .relay/personas/)', () => {
    const result = loadAll({
      tenantDir: `${COMPOSE_FIXTURES}/tenant`,
      projectDir: `${COMPOSE_FIXTURES}/no-such-project-dir`,
    });
    expect(result.errors).toEqual([]);
    expect(result.personas.size).toBe(3);
  });

  it('aggregates errors from both directories (per-file failures never block)', () => {
    // Point the loader at the invalid fixture dir as if it were a tenant dir.
    const invalidDir = resolve(HERE, '../../test/fixtures/personas/invalid');
    const result = loadAll({ tenantDir: invalidDir });
    expect(result.personas.size).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    for (const err of result.errors) {
      expect(err.source).toBe('tenant');
    }
  });
});
