import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  afterNextRender,
  effect,
  inject,
  input,
} from '@angular/core';
import { Router } from '@angular/router';

import { WsClientService } from '../services/ws-client.service';
import { BusyIndicatorComponent } from './busy-indicator.component';
import { ComposeComponent } from './compose.component';
import { ControlRailComponent } from './control-rail.component';
import { SessionHeaderComponent } from './session-header.component';
import { StatusBannerComponent } from './status-banner.component';
import { TerminalViewportComponent } from './terminal-viewport.component';

// FR-4…7, 11, 12, 14. Full route /sessions/:id (app-shell.md §4.1) — durable,
// deep-linkable, refresh-survivable. Composition + soft-keyboard handling per
// app-shell.md §5.1/§5.2. The file panel (FR-13) is DEFERRED: no server file
// surface exists (ND-44 open), so the primary area stays single-pane.
@Component({
  selector: 'app-live-session',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SessionHeaderComponent,
    StatusBannerComponent,
    TerminalViewportComponent,
    BusyIndicatorComponent,
    ControlRailComponent,
    ComposeComponent,
  ],
  template: `
    <!-- 100dvh at rest; shrinks by --keyboard-inset while compose is focused so
         the rail + compose stay above the keyboard (app-shell.md §5.2). -->
    <div class="flex flex-col" style="height: calc(100dvh - var(--keyboard-inset, 0px))">
      <app-session-header [sessionId]="id()" />
      <app-status-banner />
      <div class="min-h-0 flex-1 overflow-hidden">
        <app-terminal-viewport />
      </div>
      <app-busy-indicator />
      <app-control-rail />
      <app-compose [sessionId]="id()" />
    </div>
  `,
})
export class LiveSessionComponent implements OnDestroy {
  private readonly ws = inject(WsClientService);
  private readonly router = inject(Router);
  // Bound from the :id route param via withComponentInputBinding.
  readonly id = input.required<string>();

  private attachedId: string | null = null;
  private teardownKeyboard?: () => void;

  constructor() {
    // Attach in an effect keyed on the :id — Angular reuses this component when
    // only the route param changes (A → B → A), so ngOnInit would fire only once
    // and leave the socket bound to the wrong session. attach() is idempotent
    // (detaches first); guard so we attach once per distinct id. This opens the
    // socket (subprotocol bearer, ND-36) and begins the ND-40 buffer; reattach
    // repaints via the server's bracketed replay (D-G3).
    effect(() => {
      const id = this.id();
      if (id && id !== this.attachedId) {
        this.attachedId = id;
        this.ws.attach(id);
      }
    });
    // Terminal conditions route the user away: session gone (session_ended /
    // 4404) → home; auth failed (4401 / 1008 / auth_expired) → /pair. Without
    // this, an auth failure leaves the client stuck in 'reconnecting' forever.
    effect(() => {
      const t = this.ws.terminal();
      if (t === 'pair') void this.router.navigate(['/pair']);
      else if (t === 'home') void this.router.navigate(['/']);
    });
    afterNextRender(() => this.wireKeyboard());
  }

  ngOnDestroy(): void {
    // FR-14 fire-and-forget: detach leaves the session running server-side.
    this.ws.detach();
    this.teardownKeyboard?.();
  }

  // Per app-shell.md §5.2: on compose focusin, drive layout from visualViewport;
  // write the keyboard delta into --keyboard-inset (rAF-throttled); detach on
  // focusout. Daily path stays JS-free (resting layout is pure dvh CSS).
  private wireKeyboard(): void {
    const vv = window.visualViewport;
    if (!vv) return; // no visualViewport (desktop / unsupported) — CSS base suffices
    const root = document.documentElement;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        root.style.setProperty('--keyboard-inset', `${inset}px`);
      });
    };
    const onFocusIn = (e: FocusEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') {
        vv.addEventListener('resize', update);
        vv.addEventListener('scroll', update);
        update();
      }
    };
    const onFocusOut = () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.setProperty('--keyboard-inset', '0px');
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    this.teardownKeyboard = () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      onFocusOut();
    };
  }
}
