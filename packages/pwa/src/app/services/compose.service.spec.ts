import { describe, expect, it } from 'vitest';

import { ComposeService } from './compose.service';

describe('ComposeService', () => {
  it('keeps an independent draft per session', () => {
    const svc = new ComposeService();
    svc.draft('a').set('hello a');
    svc.draft('b').set('hello b');
    expect(svc.draft('a')()).toBe('hello a');
    expect(svc.draft('b')()).toBe('hello b');
  });

  it('returns the same signal instance for the same session', () => {
    const svc = new ComposeService();
    expect(svc.draft('a')).toBe(svc.draft('a'));
  });

  it('clear() empties the draft (but is otherwise preserved across BUSY, FR-12)', () => {
    const svc = new ComposeService();
    svc.draft('a').set('typed but rejected as busy');
    // nothing clears it on busy — only an explicit clear() does:
    svc.clear('a');
    expect(svc.draft('a')()).toBe('');
  });
});
