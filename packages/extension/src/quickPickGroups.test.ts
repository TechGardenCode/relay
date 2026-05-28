// Spec for groupQuickPickItems (ND-33 (b)/(f)): interleave a non-selectable
// Separator header before each group's items so a long picker reads by
// source/project. Groups appear in first-seen order; items keep incoming order
// within a group; a single group still earns its header; empty input is [].
//
// Coverage map — packages/extension/src/quickPickGroups.ts (ND-33 (b)/(f)):
//   Owns:
//     - separator header before each group   → describe('grouping') > 'interleaves a separator…'
//     - first-seen group order + in-group order → describe('grouping') > 'preserves first-seen…'
//     - single group still gets one header     → describe('grouping') > 'a single group…'
//     - empty input returns []                 → describe('grouping') > 'returns [] for empty…'

import { describe, it, expect } from 'vitest';

import * as vscode from 'vscode';

import { groupQuickPickItems } from './quickPickGroups.js';

interface Item extends vscode.QuickPickItem {
  label: string;
  group: string;
}

const groupOf = (item: Item): string => item.group;

describe('grouping', () => {
  it('interleaves a Separator header before each group’s items', () => {
    // Per ND-33 (b)/(f): a QuickPickItemKind.Separator row renders as a header.
    const items: Item[] = [
      { label: 'a', group: 'G1' },
      { label: 'b', group: 'G2' },
    ];
    const out = groupQuickPickItems(items, groupOf);
    expect(out).toHaveLength(4);
    const h1 = out[0];
    const h2 = out[2];
    expect(h1?.kind).toBe(vscode.QuickPickItemKind.Separator);
    expect(h1?.label).toBe('G1');
    expect(h2?.kind).toBe(vscode.QuickPickItemKind.Separator);
    expect(h2?.label).toBe('G2');
    expect(out[1]?.label).toBe('a');
    expect(out[3]?.label).toBe('b');
  });

  it('preserves first-seen group order and incoming order within a group', () => {
    const items: Item[] = [
      { label: 'b1', group: 'Beta' },
      { label: 'a1', group: 'Alpha' },
      { label: 'b2', group: 'Beta' },
      { label: 'a2', group: 'Alpha' },
    ];
    const out = groupQuickPickItems(items, groupOf);
    // Beta first (first seen), then its items in incoming order, then Alpha.
    expect(out.map((i) => i.label)).toEqual(['Beta', 'b1', 'b2', 'Alpha', 'a1', 'a2']);
  });

  it('gives a single group exactly one header', () => {
    const items: Item[] = [
      { label: 'a', group: 'Only' },
      { label: 'b', group: 'Only' },
    ];
    const out = groupQuickPickItems(items, groupOf);
    const headers = out.filter((i) => i.kind === vscode.QuickPickItemKind.Separator);
    expect(headers).toHaveLength(1);
    expect(headers[0]?.label).toBe('Only');
  });

  it('returns [] for empty input', () => {
    expect(groupQuickPickItems<Item>([], groupOf)).toEqual([]);
  });
});
