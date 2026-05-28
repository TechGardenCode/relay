// Per ND-33 items (b)/(f): the persona and attach quick-picks gain per-group
// headers so a long list reads by source/project at a glance. VS Code renders a
// `QuickPickItemKind.Separator` row as a non-selectable header, so grouping is
// just interleaving separator rows into the flat item array showQuickPick wants.
//
// Groups appear in first-seen order and items keep their incoming order within a
// group; a single group still gets its header (cheap, and consistent). This is
// purely presentational — pair it with `matchOnDescription` / `matchOnDetail` on
// the showQuickPick call so the same fields the headers group by are searchable.

import * as vscode from 'vscode';

export function groupQuickPickItems<T extends vscode.QuickPickItem>(
  items: readonly T[],
  groupLabelOf: (item: T) => string,
): (T | vscode.QuickPickItem)[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const label = groupLabelOf(item);
    const bucket = groups.get(label);
    if (bucket !== undefined) bucket.push(item);
    else groups.set(label, [item]);
  }
  const out: (T | vscode.QuickPickItem)[] = [];
  for (const [label, bucket] of groups) {
    out.push({ label, kind: vscode.QuickPickItemKind.Separator });
    out.push(...bucket);
  }
  return out;
}
