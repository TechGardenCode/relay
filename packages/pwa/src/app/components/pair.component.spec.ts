import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../services/auth.service';
import { RestClient } from '../services/rest-client.service';
import { PairComponent } from './pair.component';

function setup(getImpl: () => Promise<unknown>) {
  const navigate = vi.fn().mockResolvedValue(true);
  TestBed.configureTestingModule({
    providers: [
      { provide: RestClient, useValue: { get: vi.fn(getImpl) } },
      { provide: Router, useValue: { navigate } },
    ],
  });
  const cmp = TestBed.createComponent(PairComponent).componentInstance;
  return { cmp, navigate, auth: TestBed.inject(AuthService) };
}

describe('PairComponent', () => {
  beforeEach(() => localStorage.clear());

  it('pairs on a valid link: stores the bearer and navigates home (FR-1)', async () => {
    const { cmp, navigate, auth } = setup(() => Promise.resolve({}));
    cmp.draft.set('relay://pair?url=https://relay.lan&token=tok-9');
    await cmp.submit();
    expect(auth.bearer()).toBe('tok-9');
    expect(auth.serverUrl()).toBe('https://relay.lan');
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('rejects an invalid payload without navigating', async () => {
    const { cmp, navigate } = setup(() => Promise.resolve({}));
    cmp.draft.set('not a link');
    await cmp.submit();
    expect(cmp.error()).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('surfaces a probe failure (e.g. 401) without navigating', async () => {
    const { cmp, navigate } = setup(() => Promise.reject(new Error('unauthorized')));
    cmp.draft.set('relay://pair?token=bad');
    await cmp.submit();
    expect(cmp.error()).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });
});
