import { describe, expect, it } from 'vitest';

import { gridContains, gridCount, renderCapture } from './headless-grid.js';

// These tests pin the harness's "eyes": if the grid renderer drifts, every
// visual test downstream becomes untrustworthy. They also serve as the
// fidelity calibration the plan calls for — a known escape sequence must land
// where a real terminal would put it.

describe('renderCapture', () => {
  it('places plain text at the top-left', async () => {
    const cap = await renderCapture(Buffer.from('hello'), 10, 3);
    expect(cap.grid.split('\n')[0]).toBe('hello     ');
    expect(cap.cols).toBe(10);
    expect(cap.rows).toBe(3);
    expect(cap.altActive).toBe(false);
  });

  it('honors absolute cursor positioning (CUP)', async () => {
    // ESC[2;4H moves to row 2, col 4 (1-based); then "X".
    const cap = await renderCapture(Buffer.from('\x1b[2;4HX'), 12, 3);
    const rows = cap.grid.split('\n');
    expect(rows[1]?.charAt(3)).toBe('X');
  });

  it('detects alt-screen enter and leave', async () => {
    const entered = await renderCapture(Buffer.from('\x1b[?1049hframe'), 8, 2);
    expect(entered.altActive).toBe(true);

    const left = await renderCapture(Buffer.from('\x1b[?1049hframe\x1b[?1049l'), 8, 2);
    expect(left.altActive).toBe(false);
  });

  it('wraps a line wider than the viewport (the ND-39 tear signature)', async () => {
    // A 16-dash run drawn into an 8-col terminal must spill onto row 2 — this
    // is exactly what happens when a 120-wide frame reaches an 80-wide client.
    const cap = await renderCapture(Buffer.from('-'.repeat(16)), 8, 3);
    const rows = cap.grid.split('\n');
    expect(rows[0]).toBe('--------');
    expect(rows[1]).toBe('--------');
  });

  it('gridContains / gridCount operate on the rendered text', async () => {
    const cap = await renderCapture(Buffer.from('80x24'), 12, 1);
    expect(gridContains(cap.grid, '80x24')).toBe(true);
    expect(gridCount(cap.grid, '80x24')).toBe(1);
    expect(gridCount(cap.grid, '120x40')).toBe(0);
  });
});
