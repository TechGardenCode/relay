import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';

import { PtyOutputService } from '../services/pty-output.service';
import { WsClientService } from '../services/ws-client.service';

// FR-4 live terminal. Hosts an xterm.js instance (D-18 substrate) that consumes
// PtyOutputService and writes each chunk verbatim (opaque bytes, ws-protocol.md
// §2.4). Component-local imperative handles (not signal state — feature-modules.md
// §4.1). Theme is the xterm default (foundations.md §4 placeholder — the L1
// delivery swaps the terminal palette).
@Component({
  selector: 'app-terminal-viewport',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #term class="h-full w-full"></div>`,
})
export class TerminalViewportComponent implements OnDestroy {
  private readonly pty = inject(PtyOutputService);
  private readonly ws = inject(WsClientService);
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('term');

  private term?: Terminal;
  private fit?: FitAddon;
  private unsub?: () => void;
  private ro?: ResizeObserver;

  constructor() {
    // xterm needs the DOM — only runs in the browser, never during SSR/tests.
    afterNextRender(() => {
      const term = new Terminal({ scrollback: 5000, convertEol: false });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(this.host().nativeElement);
      fit.fit();
      this.term = term;
      this.fit = fit;

      // Verbatim bytes; D-G3: reset on replay_start so a reattach repaint does
      // not duplicate scrollback (no-op on first attach).
      this.unsub = this.pty.subscribe(
        (chunk) => term.write(chunk),
        () => term.reset(),
      );

      // Emit one resize so the PTY matches the viewport before the first TUI
      // frame (ND-23); re-fit on container resize (cheap, app-shell.md §5.3).
      this.ws.resize(term.cols, term.rows);
      this.ro = new ResizeObserver(() => {
        fit.fit();
        this.ws.resize(term.cols, term.rows);
      });
      this.ro.observe(this.host().nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
    this.unsub?.();
    this.term?.dispose();
  }
}
