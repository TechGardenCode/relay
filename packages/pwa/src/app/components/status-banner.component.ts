import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { WsClientService } from '../services/ws-client.service';

// NFR-10 observability. The single surface for connection state + errors. Copy
// per data-layer.md §3.2 (reconnect) and the ND-35 posture: a cause + a next
// action, never a raw stack. Benign WS error codes are filtered upstream in
// WsClientService so they never reach lastError.
@Component({
  selector: 'app-status-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ws.connectionState() === 'reconnecting') {
      <div class="border-y p-2 text-sm" role="status">
        Reconnecting (attempt {{ ws.reconnectAttempt() }})…
      </div>
    } @else if (ws.connectionState() === 'error') {
      <div class="flex items-center gap-2 border-y p-2 text-sm" role="alert">
        <span>Disconnected.</span>
        <button class="ml-auto rounded border px-2 py-1" (click)="ws.reconnectNow()">
          Tap to reconnect
        </button>
      </div>
    }
    @if (ws.lastError(); as err) {
      <div class="border-y p-2 text-sm" role="alert">{{ err }}</div>
    }
  `,
})
export class StatusBannerComponent {
  readonly ws = inject(WsClientService);
}
