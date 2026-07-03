import { describe, expect, it } from 'vitest';

import { CONTROL_RAIL_KEYS } from './control-rail.component';

// Per FR-5 / interaction-model.md §2. The raw control byte sequences are the
// load-bearing part of the rail; assert them directly.
describe('CONTROL_RAIL_KEYS', () => {
  const byLabel = Object.fromEntries(CONTROL_RAIL_KEYS.map((k) => [k.label, k.bytes]));

  it('maps single control keys to the correct raw bytes', () => {
    expect(byLabel['Esc']).toEqual([0x1b]);
    expect(byLabel['^C']).toEqual([0x03]);
    expect(byLabel['Tab']).toEqual([0x09]);
    expect(byLabel['⏎']).toEqual([0x0d]); // \r — self-releases via ND-24
  });

  it('maps arrows to normal cursor-mode sequences (ND-48 stopgap)', () => {
    expect(byLabel['↑']).toEqual([0x1b, 0x5b, 0x41]); // ESC [ A
    expect(byLabel['↓']).toEqual([0x1b, 0x5b, 0x42]); // ESC [ B
  });

  it('maps the plan-mode cycle to Shift+Tab (back-tab, ESC [ Z)', () => {
    expect(byLabel['⌥']).toEqual([0x1b, 0x5b, 0x5a]);
  });
});
