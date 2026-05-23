import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewChild,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { TokenStore } from '../auth/token.store';

import { TerminalHostComponent } from './terminal-host.component';
import { WsClientService, type ConnectionEvent } from './ws-client.service';

@Component({
  selector: 'spike-live-session',
  imports: [FormsModule, TerminalHostComponent],
  providers: [WsClientService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100vh;
        height: 100dvh;
        padding: 0.5rem;
        gap: 0.5rem;
        box-sizing: border-box;
      }
      header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      header h1 {
        margin: 0;
        font-size: 1rem;
        flex: 1;
        color: var(--fg-dim);
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      spike-terminal-host {
        flex: 1;
        min-height: 0;
      }
      .compose {
        display: flex;
        gap: 0.5rem;
        align-items: flex-end;
      }
      .compose textarea {
        flex: 1;
      }
      .compose .actions {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .compose .actions button {
        padding: 0.4rem 0.7rem;
        font-size: 0.85rem;
        white-space: nowrap;
      }
      .compose .actions button.send {
        padding: 0.6rem 1rem;
        font-size: 1rem;
      }
      .banner {
        padding: 0.5rem 0.75rem;
        border-radius: var(--radius);
        font-size: 0.85rem;
      }
      .banner.busy {
        background: rgba(210, 153, 34, 0.15);
        border: 1px solid rgba(210, 153, 34, 0.4);
        color: var(--warn);
      }
      .banner.reconnect {
        background: rgba(88, 166, 255, 0.12);
        border: 1px solid rgba(88, 166, 255, 0.4);
        color: var(--accent);
      }
      .banner.ended {
        background: rgba(248, 81, 73, 0.12);
        border: 1px solid rgba(248, 81, 73, 0.4);
        color: var(--danger);
      }
    `,
  ],
  template: `
    <header>
      <button type="button" (click)="back()">‹</button>
      <h1>{{ sessionId() }}</h1>
    </header>

    @if (busyVisible()) {
      <div class="banner busy">Another device is interacting with this session.</div>
    }
    @if (reconnectBanner(); as r) {
      <div class="banner reconnect">Reconnecting… (attempt {{ r.attempt }})</div>
    }
    @if (ended()) {
      <div class="banner ended">Session ended.</div>
    }

    <spike-terminal-host #term (resize)="onResize($event)" />

    <form class="compose" (submit)="onSend($event)">
      <textarea
        rows="2"
        autocapitalize="off"
        autocomplete="off"
        spellcheck="false"
        placeholder="Send a message (Enter to submit, Shift+Enter for newline)"
        [(ngModel)]="draft"
        name="draft"
        [disabled]="ended()"
        (keydown.enter)="onEnter($event)"
        (keydown)="onAnyKeydown()"
      ></textarea>
      <div class="actions">
        <button
          type="button"
          (click)="onEscape()"
          [disabled]="ended()"
          title="Send Escape — interrupts Claude's in-flight response"
        >
          Esc
        </button>
        <button
          type="button"
          (click)="onClear()"
          [disabled]="ended()"
          title="Send Ctrl+U — clears Claude's input prompt if a message is staged but not submitted"
        >
          Clear
        </button>
        <button type="submit" class="send" [disabled]="ended() || draft().length === 0">
          Send
        </button>
      </div>
    </form>
  `,
})
export class LiveSessionComponent implements OnInit {
  @ViewChild('term', { static: true }) termHost!: TerminalHostComponent;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ws = inject(WsClientService);
  private readonly tokenStore = inject(TokenStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly sessionId = signal<string>('');
  readonly draft = signal<string>('');
  readonly ended = signal<boolean>(false);
  readonly busyVisible = signal<boolean>(false);
  readonly reconnectBanner = signal<{ attempt: number } | null>(null);

  private busyDismissTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id === null) {
      void this.router.navigate(['/sessions']);
      return;
    }
    this.sessionId.set(id);
    this.ws
      .connect(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ev) => this.handleEvent(ev));
    this.destroyRef.onDestroy(() => this.ws.destroy());
  }

  back(): void {
    void this.router.navigate(['/sessions']);
  }

  // Send the ESC byte (0x1b). In Claude Code's TUI this interrupts an
  // in-flight response and returns control to the input prompt. The byte
  // does not contain `\r` or `\n`, so per ND-24 the claim stays held
  // after this send — fine for the spike (next user action either sends
  // a newline-bearing message that releases, or the 30 s ND-01 timeout
  // expires).
  onEscape(): void {
    this.ws.claim();
    this.ws.send(new Uint8Array([0x1b]));
  }

  // Send Ctrl+U (0x15) — the POSIX line-discipline "kill" character and
  // the convention every Unix line editor (readline, ink, blessed) honors
  // as "clear input from cursor back to start." Useful when characters
  // streamed to the PTY landed in Claude's input prompt but the user
  // doesn't want to actually submit them.
  onClear(): void {
    this.ws.claim();
    this.ws.send(new Uint8Array([0x15]));
  }

  onSend(ev: Event): void {
    ev.preventDefault();
    const text = this.draft();
    if (text.length === 0) return;
    // Per D-G2 + ws-protocol.md §5.1: SEND requires a held claim. Issue a
    // claim first; if a peer holds it the server replies `busy` (handled
    // in handleServerFrame) and the SEND is dropped server-side with a
    // non-fatal `send_without_claim` error.
    this.ws.claim();
    // Terminal Enter is CR (0x0d), not LF (0x0a) — TUIs running in raw
    // mode (Claude Code, vim, anything ink/blessed-based) read `\r` from
    // stdin and treat that as Return. LF would queue into the input
    // buffer without committing. Per ND-24 + ws-frames.ts §SendFrameSchema
    // the server's claim auto-release scans for both `\r` and `\n`, so
    // CR is also a valid release trigger.
    const payload = new TextEncoder().encode(text + '\r');
    const ok = this.ws.send(payload);
    if (ok) this.draft.set('');
  }

  // Angular's `(keydown.enter)` event-modifier matches both plain Enter and
  // NumpadEnter and fires reliably across browsers. Shift+Enter falls through
  // to the textarea default (newline) because `(keydown.enter)` only catches
  // unmodified Enter. IME composition (e.g., mobile autocomplete commit) is
  // skipped so we don't submit a half-typed glyph.
  onEnter(ev: KeyboardEvent): void {
    if (ev.isComposing) return;
    ev.preventDefault();
    this.onSend(ev);
  }

  // Per prd/05-mobile-pwa.md §3a: BUSY banner auto-dismisses on the next
  // user keystroke. Bound on the general keydown stream so any keypress
  // (not just Enter) clears the affordance.
  onAnyKeydown(): void {
    if (this.busyVisible()) this.dismissBusy();
  }

  onResize(size: { cols: number; rows: number }): void {
    this.ws.resize(size.cols, size.rows);
  }

  private handleEvent(ev: ConnectionEvent): void {
    switch (ev.kind) {
      case 'connected':
        this.reconnectBanner.set(null);
        // Per D-G3: on (re)connect, the server bracketed-replays the
        // ring buffer. Clear the terminal so we don't duplicate scrollback.
        this.termHost.clear();
        return;
      case 'reconnecting':
        this.reconnectBanner.set({ attempt: ev.attempt });
        return;
      case 'closed':
        // The 4401 close code carries the auth_expired text frame that
        // arrived just before; the frame handler will have cleared the
        // token already.
        return;
      case 'bytes':
        this.termHost.write(ev.data);
        return;
      case 'frame':
        this.handleServerFrame(ev.frame);
        return;
    }
  }

  private handleServerFrame(frame: import('@relay/protocol').ServerFrame): void {
    switch (frame.type) {
      case 'hello':
      case 'replay_start':
      case 'replay_end':
      case 'claim_ack':
      case 'claim_released':
      case 'error':
        // For the spike, these are observable in devtools but the UI
        // doesn't need to render dedicated affordances. Logging keeps
        // a phone-attached debugger informative.
        if (frame.type === 'error') console.warn('server error frame', frame);
        return;
      case 'busy':
        // Per prd/05-mobile-pwa.md §3a + ND-02: one-shot inline
        // indicator above the compose field, auto-dismiss after 4s,
        // draft preserved, no auto-retry.
        this.showBusy();
        return;
      case 'session_ended':
        this.ended.set(true);
        return;
      case 'auth_expired':
        // Per ws-protocol.md §2.3: clear by tokenId so a stale tab's
        // revocation doesn't blow away a freshly-paired token.
        this.tokenStore.clear(frame.tokenId);
        void this.router.navigate(['/pair']);
        return;
    }
  }

  private showBusy(): void {
    this.busyVisible.set(true);
    if (this.busyDismissTimer !== null) clearTimeout(this.busyDismissTimer);
    this.busyDismissTimer = setTimeout(() => this.dismissBusy(), 4000);
  }

  private dismissBusy(): void {
    this.busyVisible.set(false);
    if (this.busyDismissTimer !== null) {
      clearTimeout(this.busyDismissTimer);
      this.busyDismissTimer = null;
    }
  }
}
