import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  Output,
  ViewChild,
  type AfterViewInit,
} from '@angular/core';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';

@Component({
  selector: 'spike-terminal-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: block;
        background: #000;
        border-radius: var(--radius);
        overflow: hidden;
      }
      .host {
        height: 100%;
        width: 100%;
      }
    `,
  ],
  template: `<div class="host" #host></div>`,
})
export class TerminalHostComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;
  @Output() readonly resize = new EventEmitter<{ cols: number; rows: number }>();

  private terminal: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private resizeObserver: ResizeObserver | null = null;

  ngAfterViewInit(): void {
    const term = new Terminal({
      convertEol: false,
      cursorBlink: false,
      // 14px on phone is the smallest that's still readable in
      // landscape; tweak if dogfooding finds otherwise.
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      // No live scroll-back navigation on touch — xterm.js's scroll
      // behavior on touch is uneven. Default scroll lines is fine for
      // monitoring; for actual review the user goes back to the laptop.
      theme: {
        background: '#000000',
        foreground: '#e6edf3',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(this.hostRef.nativeElement);
    this.terminal = term;
    this.fitAddon = fit;

    // First fit + emit after the layout settles. requestAnimationFrame
    // is the simplest "after the DOM has measured itself" handle.
    requestAnimationFrame(() => this.emitFit());

    // Per ND-23: re-emit a resize frame whenever the viewport changes
    // (rotation, soft keyboard show/hide, browser chrome appear/
    // disappear). ResizeObserver fires once per layout change.
    this.resizeObserver = new ResizeObserver(() => this.emitFit());
    this.resizeObserver.observe(this.hostRef.nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.terminal?.dispose();
    this.terminal = null;
    this.fitAddon = null;
  }

  write(data: Uint8Array): void {
    // xterm.js write() accepts Uint8Array directly.
    this.terminal?.write(data);
  }

  /** Clear scrollback. Called before consuming a fresh replay (D-G3). */
  clear(): void {
    this.terminal?.reset();
  }

  private emitFit(): void {
    if (this.fitAddon === null || this.terminal === null) return;
    try {
      this.fitAddon.fit();
    } catch {
      // FitAddon throws when the host has zero size (e.g., parent is
      // hidden). Safe to ignore — the next ResizeObserver tick will fire
      // a successful fit.
      return;
    }
    this.resize.emit({ cols: this.terminal.cols, rows: this.terminal.rows });
  }
}
