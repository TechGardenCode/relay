import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WsClientService } from '../services/ws-client.service';
import { BusyIndicatorComponent } from './busy-indicator.component';

type ClaimState = 'released' | 'claimed-local' | 'busy-other';

function setup(initial: ClaimState) {
  const claimState = signal<ClaimState>(initial);
  TestBed.configureTestingModule({
    providers: [{ provide: WsClientService, useValue: { claimState } }],
  });
  const fixture = TestBed.createComponent(BusyIndicatorComponent);
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance, claimState };
}

describe('BusyIndicatorComponent (ND-02)', () => {
  afterEach(() => vi.useRealTimers());

  it('is hidden when not busy and shown on busy-other', () => {
    const { fixture, cmp, claimState } = setup('released');
    expect(cmp.visible()).toBe(false);
    claimState.set('busy-other');
    fixture.detectChanges();
    expect(cmp.visible()).toBe(true);
  });

  it('auto-dismisses after 4 seconds while still busy (ND-02 §3)', () => {
    vi.useFakeTimers();
    const { fixture, cmp, claimState } = setup('busy-other');
    fixture.detectChanges();
    expect(cmp.visible()).toBe(true);
    vi.advanceTimersByTime(4000);
    expect(cmp.visible()).toBe(false); // dismissed even though claimState is still busy-other
    expect((claimState as WritableSignal<ClaimState>)()).toBe('busy-other');
  });

  it('hides immediately when contention clears (retry re-claim leaves busy-other)', () => {
    const { fixture, cmp, claimState } = setup('busy-other');
    fixture.detectChanges();
    expect(cmp.visible()).toBe(true);
    claimState.set('claimed-local');
    fixture.detectChanges();
    expect(cmp.visible()).toBe(false);
  });
});
