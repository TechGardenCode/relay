import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { pairStatusGuard } from './pair-status.guard';

const route = {} as ActivatedRouteSnapshot;
const state = {} as RouterStateSnapshot;

function runGuard() {
  return TestBed.runInInjectionContext(() => pairStatusGuard(route, state));
}

describe('pairStatusGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Router,
          useValue: {
            createUrlTree: (cmds: string[]) => ({ commands: cmds }) as unknown as UrlTree,
          },
        },
      ],
    });
  });

  it('allows navigation when paired', () => {
    localStorage.setItem('relay.bearer', 'tok'); // AuthService boots paired
    expect(runGuard()).toBe(true);
  });

  it('bounces unauthenticated navigation to a /pair UrlTree', () => {
    const result = runGuard() as unknown as { commands: string[] };
    expect(result.commands).toEqual(['/pair']);
  });
});
