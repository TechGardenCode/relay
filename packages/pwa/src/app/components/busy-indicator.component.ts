import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { WsClientService } from '../services/ws-client.service';

// Per ND-02 §3 lifecycle: the notice auto-dismisses after 4 seconds.
const AUTO_DISMISS_MS = 4000;

// FR-12 BUSY handling. On a busy frame another connection holds the claim. Per
// ND-02: a one-shot, dismissible inline notice anchored near the input; the
// draft is preserved (ComposeService); retry is MANUAL only — no auto-retry.
// Lifecycle (§3): dismisses automatically after 4 s, or immediately when the
// user retries (tapping Send re-claims → leaves busy-other → hides). Wording is
// the low-alarm §2 copy (no "CLAIM"/"BUSY"/"lock" jargon).
@Component({
  selector: 'app-busy-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="flex items-center gap-2 border-y p-2 text-sm" role="status">
        <span>Another device is interacting with this session.</span>
        <button class="ml-auto rounded border px-2 py-1" (click)="dismiss()">Dismiss</button>
      </div>
    }
  `,
})
export class BusyIndicatorComponent implements OnDestroy {
  private readonly ws = inject(WsClientService);
  private readonly dismissed = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly visible = computed(() => this.ws.claimState() === 'busy-other' && !this.dismissed());

  constructor() {
    effect(() => {
      // Depend on busyTick so a REPEAT busy re-arms the notice even when
      // claimState is already 'busy-other' (same value → no claimState emission).
      this.ws.busyTick();
      if (this.ws.claimState() === 'busy-other') {
        // A fresh busy shows the notice and arms the §3 auto-dismiss.
        this.dismissed.set(false);
        this.arm();
      } else {
        // Contention cleared or the user retried (re-claim leaves busy-other).
        this.dismissed.set(false);
        this.clear();
      }
    });
  }

  ngOnDestroy(): void {
    this.clear();
  }

  dismiss(): void {
    this.dismissed.set(true);
    this.clear();
  }

  private arm(): void {
    this.clear();
    this.timer = setTimeout(() => this.dismissed.set(true), AUTO_DISMISS_MS);
  }

  private clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
