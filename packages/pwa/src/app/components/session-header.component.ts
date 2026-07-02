import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';

import { SessionsService } from '../services/sessions.service';
import { WsClientService } from '../services/ws-client.service';

// FR-11 session controls + FR-2 header. All three actions are on the canonical
// contract (feature-modules.md §4.6).
@Component({
  selector: 'app-session-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="flex items-center gap-2 border-b p-2 text-sm">
      <span class="font-mono">{{ shortId() }}</span>
      <span class="opacity-60">{{ ws.connectionState() }}</span>
      <span class="ml-auto flex gap-1">
        <button class="rounded border px-2 py-1" (click)="detach()">Detach</button>
        <button class="rounded border px-2 py-1" (click)="release()">Release</button>
        <button class="rounded border px-2 py-1" (click)="kill()">Kill</button>
      </span>
    </header>
  `,
})
export class SessionHeaderComponent {
  readonly ws = inject(WsClientService);
  private readonly sessions = inject(SessionsService);
  private readonly router = inject(Router);
  readonly sessionId = input.required<string>();

  shortId(): string {
    return this.sessionId().slice(-6);
  }

  // Detach — leave running (FR-14): close the WS, navigate home, NO REST call.
  // The server session keeps running; D-G3 guarantees a clean reattach later.
  detach(): void {
    this.ws.detach();
    void this.router.navigate(['/']);
  }

  // Release claim — best-effort voluntary release (ws-protocol.md §2.2) so a
  // queued device takes over without waiting out the timeout.
  release(): void {
    this.ws.release();
  }

  // Kill — DELETE /sessions/:id → 204 (idempotent). The server emits
  // session_ended; return home.
  async kill(): Promise<void> {
    await this.sessions.kill(this.sessionId());
    this.ws.detach();
    void this.router.navigate(['/']);
  }
}
