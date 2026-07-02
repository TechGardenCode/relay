// Spec for buildSessionQuickPickItems (ND-33 (f)): the attach picker maps each
// Session to an item (label=short session id per D-17, description=id,
// detail="<project> · <agentSessionId|placeholder>") and groups them under per-project separator
// headers built from the injected projectLabelOf callback — a display name when
// the labeller resolves one, the raw projectId on fallback. Exported builder is
// tested directly; the full relay.attachSession command needs creds/REST mocking
// out of scope here.
//
// Coverage map — packages/extension/src/commands/attachSession.ts (ND-33 (f)):
//   Owns:
//     - item shape (label/description/detail)   → describe('item shape')
//     - per-project separator headers           → describe('grouping') > 'groups under…'
//     - display-name vs projectId fallback header → describe('grouping') > 'uses labeller…'

import { describe, it, expect } from 'vitest';

import * as vscode from 'vscode';

import { type Session, type SessionStatus } from '@relay/protocol';

import { buildSessionQuickPickItems } from './attachSession.js';

// 26-char Crockford-Base32 ULIDs (UlidSchema requires length 26).
const PROJECT_A = '01HZZZZZZZZZZZZZZZZZPROJA';
const PROJECT_B = '01HZZZZZZZZZZZZZZZZZPROJB';
const SESSION_1 = '01HZZZZZZZZZZZZZZZZSESSON1';
const SESSION_2 = '01HZZZZZZZZZZZZZZZZSESSON2';

function makeSession(
  id: string,
  projectId: string,
  status: SessionStatus,
  agentSessionId: string | null = null,
): Session {
  return {
    id,
    projectId,
    agentCli: 'claude',
    agentSessionId,
    ptyPid: null,
    status,
    terminatedReason: null,
    totalBytes: 0,
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
  };
}

describe('item shape', () => {
  it('maps a session to label=short session id, description=id, detail="<project> · <agentSessionId>"', () => {
    const items = buildSessionQuickPickItems(
      [makeSession(SESSION_1, PROJECT_A, 'running', 'agent-abc')],
      () => 'Alpha',
    );
    // [0] is the separator header; [1] is the session item.
    const item = items[1];
    // Per D-17: label is the short session id, not a persona name.
    expect(item?.label).toBe(SESSION_1.slice(0, 8));
    expect(item?.description).toBe(SESSION_1);
    expect(item?.detail).toBe('Alpha · agent-abc');
  });

  it('renders a pending placeholder when agentSessionId is null', () => {
    const items = buildSessionQuickPickItems(
      [makeSession(SESSION_1, PROJECT_A, 'running', null)],
      () => 'Alpha',
    );
    expect(items[1]?.detail).toBe('Alpha · (agent session id pending)');
  });
});

describe('grouping', () => {
  it('groups sessions under per-project separator headers', () => {
    // Per ND-33 (f): separator rows label each project group.
    const items = buildSessionQuickPickItems(
      [makeSession(SESSION_1, PROJECT_A, 'running'), makeSession(SESSION_2, PROJECT_B, 'running')],
      (id) => (id === PROJECT_A ? 'Alpha' : 'Bravo'),
    );
    const headers = items.filter((i) => i.kind === vscode.QuickPickItemKind.Separator);
    expect(headers.map((h) => h.label)).toEqual(['Alpha', 'Bravo']);
  });

  it('uses the labeller’s display name, falling back to the raw projectId', () => {
    // PROJECT_A resolves to a display name; PROJECT_B falls through to its id —
    // proving both header branches in one call.
    const labelOf = (id: string): string => (id === PROJECT_A ? 'Alpha' : id);
    const items = buildSessionQuickPickItems(
      [makeSession(SESSION_1, PROJECT_A, 'running'), makeSession(SESSION_2, PROJECT_B, 'running')],
      labelOf,
    );
    const headers = items.filter((i) => i.kind === vscode.QuickPickItemKind.Separator);
    expect(headers.map((h) => h.label)).toEqual(['Alpha', PROJECT_B]);
  });
});
