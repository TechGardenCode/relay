import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
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
export class LiveSessionComponent implements OnInit, OnDestroy {
  private readonly ws = inject(WsClientService);
  private readonly router = inject(Router);
  // Bound from the :id route param via withComponentInputBinding.
  readonly id = input.required<string>();

  private teardownKeyboard?: () => void;

  constructor() {
    // FR-11/session_ended: when the agent exits or the session is killed, the
    // server emits session_ended — return home.
    effect(() => {
      if (this.ws.ended()) void this.router.navigate(['/']);
    });
    afterNextRender(() => this.wireKeyboard());
  }

  ngOnInit(): void {
    // Attach opens the socket (subprotocol bearer, ND-36) and begins the ND-40
    // buffer; the viewport drains it on subscribe. Reattach repaints via the
    // server's bracketed replay (D-G3).
    this.ws.attach(this.id());
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
