// Spec for buildPersonaQuickPickItems (ND-33 (b)): the persona picker maps each
// PersonaResource to an item (label=name, description, detail="source · path")
// and groups them under per-source separator headers, tenant before project in
// first-seen order. Exported builder is tested directly — the full
// relay.startSession command needs creds/root/REST mocking out of scope here.
//
// Coverage map — packages/extension/src/commands/startSession.ts (ND-33 (b)):
//   Owns:
//     - item shape (label/description/detail)  → describe('item shape')
//     - per-source separator headers           → describe('grouping') > 'groups under…'
//     - tenant before project (first-seen)     → describe('grouping') > 'orders tenant…'

import { describe, it, expect } from 'vitest';

import * as vscode from 'vscode';

import { type PersonaResource, type PersonaSource } from '@relay/protocol';

import { buildPersonaQuickPickItems } from './startSession.js';

function makePersona(
  name: string,
  source: PersonaSource,
  filePath: string,
  description?: string,
): PersonaResource {
  return { schemaVersion: 1, name, description, source, filePath };
}

describe('item shape', () => {
  it('maps a persona to label=name, description, detail="source · filePath"', () => {
    const items = buildPersonaQuickPickItems([
      makePersona('reviewer', 'tenant', '/etc/relay/personas/reviewer.yaml', 'Reviews code'),
    ]);
    // [0] is the separator header; [1] is the persona item.
    const item = items[1];
    expect(item?.label).toBe('reviewer');
    expect(item?.description).toBe('Reviews code');
    expect(item?.detail).toBe('tenant · /etc/relay/personas/reviewer.yaml');
  });
});

describe('grouping', () => {
  it('groups personas under per-source separator headers', () => {
    // Per ND-33 (b): separator rows label each source group.
    const items = buildPersonaQuickPickItems([
      makePersona('reviewer', 'tenant', '/t/reviewer.yaml'),
      makePersona('builder', 'project', '/p/builder.yaml'),
    ]);
    const headers = items.filter((i) => i.kind === vscode.QuickPickItemKind.Separator);
    expect(headers.map((h) => h.label)).toEqual(['Tenant personas', 'Project personas']);
  });

  it('orders the tenant group before the project group (first-seen)', () => {
    // Input is tenant-first, so the tenant header leads.
    const items = buildPersonaQuickPickItems([
      makePersona('reviewer', 'tenant', '/t/reviewer.yaml'),
      makePersona('builder', 'project', '/p/builder.yaml'),
    ]);
    expect(items.map((i) => i.label)).toEqual([
      'Tenant personas',
      'reviewer',
      'Project personas',
      'builder',
    ]);
  });
});
