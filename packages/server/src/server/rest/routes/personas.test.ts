import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import yaml from 'js-yaml';

import { personasDir } from '../../../config/paths.js';
import { makeTestRig, type TestRig } from '../test-helpers.js';

describe('routes/personas', () => {
  let rig: TestRig;

  beforeEach(async () => {
    rig = await makeTestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  function seedPersona(name: string, body: object): string {
    const dir = personasDir(rig.homeOverride);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${name}.yaml`);
    writeFileSync(filePath, yaml.dump(body));
    return filePath;
  }

  it('GET /personas returns the empty set on a fresh tenant', async () => {
    const res = await rig.app.inject({
      method: 'GET',
      url: '/personas',
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[]; errors: unknown[] };
    expect(body.items).toEqual([]);
    expect(body.errors).toEqual([]);
  });

  it('GET /personas returns tenant-level personas with source + filePath', async () => {
    seedPersona('dev', {
      schemaVersion: 1,
      name: 'dev',
      description: 'implementation engineer',
      systemPrompt: 'be terse',
    });
    const res = await rig.app.inject({
      method: 'GET',
      url: '/personas',
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{ name: string; source: string; filePath: string }>;
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.name).toBe('dev');
    expect(body.items[0]?.source).toBe('tenant');
    expect(body.items[0]?.filePath).toContain('dev.yaml');
  });

  it('POST /personas creates a tenant YAML file and returns 201 + Location', async () => {
    const res = await rig.app.inject({
      method: 'POST',
      url: '/personas',
      headers: { Authorization: rig.authHeader },
      payload: {
        schemaVersion: 1,
        name: 'qa',
        description: 'quality assurance',
        systemPrompt: 'test thoroughly',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers.location).toBe('/personas/qa');
    const body = res.json() as { name: string; source: string; filePath: string };
    expect(body.name).toBe('qa');
    expect(body.source).toBe('tenant');
    expect(existsSync(body.filePath)).toBe(true);
    const written = yaml.load(readFileSync(body.filePath, 'utf8')) as { name: string };
    expect(written.name).toBe('qa');
  });

  it('POST /personas with body.name not matching kebab-case → 422 persona-invalid', async () => {
    const res = await rig.app.inject({
      method: 'POST',
      url: '/personas',
      headers: { Authorization: rig.authHeader },
      payload: {
        schemaVersion: 1,
        name: 'Bad_Name',
        description: 'invalid',
      },
    });
    // Zod refuses the name regex first → 400 with validationErrors (schema
    // rejection precedes business-rule rejection per rest-conventions.md §3).
    expect(res.statusCode).toBe(400);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/validation-failed/);
  });

  it('POST /personas with extra top-level field → 400 via .strict() Zod', async () => {
    const res = await rig.app.inject({
      method: 'POST',
      url: '/personas',
      headers: { Authorization: rig.authHeader },
      payload: {
        schemaVersion: 1,
        name: 'qa',
        unknownField: 'rejected',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/validation-failed/);
  });

  it('POST /personas for a name that already exists → 409 persona-already-exists', async () => {
    await rig.app.inject({
      method: 'POST',
      url: '/personas',
      headers: { Authorization: rig.authHeader },
      payload: { schemaVersion: 1, name: 'qa', description: 'first' },
    });
    const res = await rig.app.inject({
      method: 'POST',
      url: '/personas',
      headers: { Authorization: rig.authHeader },
      payload: { schemaVersion: 1, name: 'qa', description: 'second' },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/persona-already-exists/);
  });

  it('PATCH /personas/:id merges fields and rewrites the YAML', async () => {
    seedPersona('dev', {
      schemaVersion: 1,
      name: 'dev',
      description: 'old description',
    });
    const res = await rig.app.inject({
      method: 'PATCH',
      url: '/personas/dev',
      headers: { Authorization: rig.authHeader },
      payload: { description: 'new description' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { description: string };
    expect(body.description).toBe('new description');
  });

  it('PATCH /personas/:id rejecting a rename via body.name → 422 persona-rename-unsupported', async () => {
    seedPersona('dev', { schemaVersion: 1, name: 'dev', description: 'd' });
    const res = await rig.app.inject({
      method: 'PATCH',
      url: '/personas/dev',
      headers: { Authorization: rig.authHeader },
      payload: { name: 'qa' },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/persona-rename-unsupported/);
  });

  it('DELETE /personas/:id removes the YAML file (404 on second delete)', async () => {
    seedPersona('dev', { schemaVersion: 1, name: 'dev', description: 'd' });
    const first = await rig.app.inject({
      method: 'DELETE',
      url: '/personas/dev',
      headers: { Authorization: rig.authHeader },
    });
    expect(first.statusCode).toBe(204);
    const second = await rig.app.inject({
      method: 'DELETE',
      url: '/personas/dev',
      headers: { Authorization: rig.authHeader },
    });
    expect(second.statusCode).toBe(404);
  });

  it('GET /personas/:id for unknown name returns 404', async () => {
    const res = await rig.app.inject({
      method: 'GET',
      url: '/personas/nonexistent',
      headers: { Authorization: rig.authHeader },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { type: string };
    expect(body.type).toMatch(/errors\/persona-not-found/);
  });
});
