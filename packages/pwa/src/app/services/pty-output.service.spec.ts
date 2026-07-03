import { describe, expect, it } from 'vitest';

import { PtyOutputService } from './pty-output.service';

describe('PtyOutputService', () => {
  it('drops a push when there is no consumer (buffer is upstream in WsClientService)', () => {
    const svc = new PtyOutputService();
    expect(() => svc.push(new Uint8Array([65]))).not.toThrow();
    expect(svc.hasConsumer()).toBe(false);
  });

  it('delivers pushes to the subscribed consumer in order', () => {
    const svc = new PtyOutputService();
    const got: number[] = [];
    svc.subscribe((c) => got.push(...c));
    svc.push(new Uint8Array([65]));
    svc.push(new Uint8Array([66, 67]));
    expect(got).toEqual([65, 66, 67]);
  });

  it('fires the drain hook on subscribe (ND-40 drain trigger)', () => {
    const svc = new PtyOutputService();
    let drained = 0;
    svc.setDrainHook(() => drained++);
    svc.subscribe(() => {});
    expect(drained).toBe(1);
  });

  it('reset() fires the consumer onReset (D-G3 reattach repaint)', () => {
    const svc = new PtyOutputService();
    let reset = 0;
    svc.subscribe(
      () => {},
      () => reset++,
    );
    svc.reset();
    expect(reset).toBe(1);
  });

  it('unsubscribe stops delivery', () => {
    const svc = new PtyOutputService();
    const got: number[] = [];
    const unsub = svc.subscribe((c) => got.push(...c));
    unsub();
    svc.push(new Uint8Array([65]));
    expect(got).toEqual([]);
    expect(svc.hasConsumer()).toBe(false);
  });
});
