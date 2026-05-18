// `relay persona {list,create}` handlers.
// list: composes tenant + project personas via persona/loadAll.
// create: validates D-09 name regex, writes a 0600 stub, opens $EDITOR.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PersonaCreateError, runPersonaCreate, runPersonaList } from './persona.js';

const DEFAULT_PERSONAS_DIR = join(import.meta.dirname, '..', '..', 'personas', 'defaults');

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'relay-cli-persona-'));
  // Stand up ~/.relay/personas/ with one tenant-level YAML so list/create
  // both have a real directory to operate on. We bypass runInit() to keep
  // this test fast — it doesn't need a token store.
  mkdirSync(join(home, '.relay', 'personas'), { recursive: true });
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('runPersonaList', () => {
  it('returns an empty list when ~/.relay/personas/ exists but is empty', () => {
    const result = runPersonaList({ homeOverride: home });
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('lists the seven 1A defaults when ~/.relay/personas/ holds them', () => {
    // Copy the default personas into the test home.
    for (const entry of readdirSync(DEFAULT_PERSONAS_DIR)) {
      if (!entry.endsWith('.yaml')) continue;
      copyFileSync(join(DEFAULT_PERSONAS_DIR, entry), join(home, '.relay', 'personas', entry));
    }
    const result = runPersonaList({ homeOverride: home });
    expect(result.rows.map((r) => r.name).sort()).toEqual(
      ['architect', 'design', 'dev', 'infra', 'product', 'review', 'test'].sort(),
    );
    // All sourced from tenant; project dir not consulted.
    for (const row of result.rows) {
      expect(row.source).toBe('tenant');
    }
  });

  it('honors project-level overrides per D-09 composition rule (project shadows tenant by name)', () => {
    // Tenant has `dev` with description X; project supplies a `dev` with description Y.
    writeFileSync(
      join(home, '.relay', 'personas', 'dev.yaml'),
      'schemaVersion: 1\nname: dev\ndescription: tenant-dev\n',
    );
    const projectDir = mkdtempSync(join(tmpdir(), 'relay-cli-persona-project-'));
    mkdirSync(join(projectDir, '.relay', 'personas'), { recursive: true });
    writeFileSync(
      join(projectDir, '.relay', 'personas', 'dev.yaml'),
      'schemaVersion: 1\nname: dev\ndescription: project-dev\n',
    );

    const result = runPersonaList({ homeOverride: home, projectPath: projectDir });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.source).toBe('project');
    expect(result.rows[0]?.description).toBe('project-dev');

    rmSync(projectDir, { recursive: true, force: true });
  });

  it('surfaces persona load errors without blocking valid files', () => {
    writeFileSync(join(home, '.relay', 'personas', 'good.yaml'), 'schemaVersion: 1\nname: good\n');
    writeFileSync(join(home, '.relay', 'personas', 'broken.yaml'), '!! not yaml');
    const result = runPersonaList({ homeOverride: home });
    expect(result.rows.map((r) => r.name)).toEqual(['good']);
    expect(result.errors).toHaveLength(1);
  });
});

describe('runPersonaCreate', () => {
  it('writes a kebab-case stub at ~/.relay/personas/<name>.yaml with schemaVersion + name seeded', async () => {
    const { filePath } = await runPersonaCreate(
      { name: 'my-persona', skipEditor: true },
      { homeOverride: home },
    );
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, 'utf8');
    expect(content).toContain('schemaVersion: 1');
    expect(content).toContain('name: my-persona');
  });

  it('rejects names that fail D-09 PERSONA_NAME_REGEX', async () => {
    await expect(
      runPersonaCreate({ name: 'BadName', skipEditor: true }, { homeOverride: home }),
    ).rejects.toBeInstanceOf(PersonaCreateError);
    await expect(
      runPersonaCreate({ name: '1leading-digit', skipEditor: true }, { homeOverride: home }),
    ).rejects.toBeInstanceOf(PersonaCreateError);
  });

  it('refuses to overwrite an existing file', async () => {
    await runPersonaCreate({ name: 'foo', skipEditor: true }, { homeOverride: home });
    try {
      await runPersonaCreate({ name: 'foo', skipEditor: true }, { homeOverride: home });
      expect.fail('expected PersonaCreateError');
    } catch (err) {
      expect(err).toBeInstanceOf(PersonaCreateError);
      expect((err as PersonaCreateError).code).toBe('already_exists');
    }
  });
});
