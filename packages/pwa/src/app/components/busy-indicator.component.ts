import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { WsClientService } from '../services/ws-client.service';

// FR-12 BUSY handling. On a busy frame another connection holds the claim. Per
// ND-02: a dismissible inline indicator, the draft is preserved (ComposeService),
// and retry is MANUAL only — no auto-retry. Retry = the user tapping Send again
// in compose; this surface only informs and dismisses.
@Component({
  selector: 'app-busy-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="flex items-center gap-2 border-y p-2 text-sm" role="status">
        <span>Another device is holding input. Your draft is kept — tap Send to retry.</span>
        <button class="ml-auto rounded border px-2 py-1" (click)="dismiss()">Dismiss</button>
      </div>
    }
  `,
})
export class BusyIndicatorComponent {
  private readonly ws = inject(WsClientService);
  private readonly dismissed = signal(false);

  readonly visible = computed(() => this.ws.claimState() === 'busy-other' && !this.dismissed());

  constructor() {
    // Reset the dismissal once contention clears, so a fresh busy re-shows it.
    effect(() => {
      if (this.ws.claimState() !== 'busy-other') this.dismissed.set(false);
    });
  }

  dismiss(): void {
    this.dismissed.set(true);
  }
}
