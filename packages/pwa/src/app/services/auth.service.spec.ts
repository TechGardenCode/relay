import { beforeEach, describe, expect, it } from 'vitest';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  beforeEach(() => localStorage.clear());

  it('parses token AND url out of a D-13 relay://pair link (ND-45)', () => {
    const svc = new AuthService();
    expect(svc.parsePairPayload('relay://pair?url=https://relay.lan&token=abc.def')).toEqual({
      token: 'abc.def',
      url: 'https://relay.lan',
    });
  });

  it('accepts a token-only link (same-origin case, url null)', () => {
    const svc = new AuthService();
    expect(svc.parsePairPayload('relay://pair?token=abc.def')).toEqual({
      token: 'abc.def',
      url: null,
    });
  });

  it('returns null when no token is present', () => {
    const svc = new AuthService();
    expect(svc.parsePairPayload('relay://pair?url=https://relay.lan')).toBeNull();
    expect(svc.parsePairPayload('garbage')).toBeNull();
  });

  it('setPaired persists bearer + serverUrl and flips pairStatus to paired', () => {
    const svc = new AuthService();
    svc.setPaired({ token: 'tok-1', url: 'https://relay.lan' });
    expect(svc.bearer()).toBe('tok-1');
    expect(svc.serverUrl()).toBe('https://relay.lan');
    expect(svc.pairStatus()).toBe('paired');
    expect(localStorage.getItem('relay.bearer')).toBe('tok-1');
    expect(localStorage.getItem('relay.serverUrl')).toBe('https://relay.lan');
  });

  it('setPaired with a null url clears any stored serverUrl (same-origin)', () => {
    localStorage.setItem('relay.serverUrl', 'https://stale.lan');
    const svc = new AuthService();
    svc.setPaired({ token: 'tok-1', url: null });
    expect(svc.serverUrl()).toBeNull();
    expect(localStorage.getItem('relay.serverUrl')).toBeNull();
  });

  it('boots paired when a bearer is already in localStorage', () => {
    localStorage.setItem('relay.bearer', 'tok-persist');
    localStorage.setItem('relay.serverUrl', 'https://relay.lan');
    const svc = new AuthService();
    expect(svc.bearer()).toBe('tok-persist');
    expect(svc.serverUrl()).toBe('https://relay.lan');
    expect(svc.pairStatus()).toBe('paired');
  });

  it('clear() unpairs and wipes both keys', () => {
    localStorage.setItem('relay.bearer', 'tok-x');
    localStorage.setItem('relay.serverUrl', 'https://relay.lan');
    const svc = new AuthService();
    svc.clear();
    expect(svc.bearer()).toBeNull();
    expect(svc.serverUrl()).toBeNull();
    expect(svc.pairStatus()).toBe('unpaired');
    expect(localStorage.getItem('relay.bearer')).toBeNull();
    expect(localStorage.getItem('relay.serverUrl')).toBeNull();
  });
});
