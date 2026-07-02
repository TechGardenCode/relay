import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';

import { ComposeService } from '../services/compose.service';
import { WsClientService } from '../services/ws-client.service';

const encoder = new TextEncoder();

// Per FR-7 raw mode: map a keyboard event to raw bytes (ND-24 per-keystroke).
function keyToBytes(ev: KeyboardEvent): Uint8Array | null {
  if (ev.ctrlKey && ev.key.length === 1) {
    const c = ev.key.toLowerCase().charCodeAt(0);
    if (c >= 97 && c <= 122) return new Uint8Array([c - 96]); // Ctrl-A..Z → 0x01..0x1a
  }
  if (ev.key === 'Enter') return new Uint8Array([0x0d]);
  if (ev.key === 'Tab') return new Uint8Array([0x09]);
  if (ev.key === 'Backspace') return new Uint8Array([0x7f]);
  if (ev.key.length === 1) return encoder.encode(ev.key);
  return null; // arrows/esc etc. come from the control rail
}

// FR-6 compose + FR-7 raw toggle. The default input: a draft + explicit Send
// (NEVER auto-sends). Draft is preserved across BUSY (FR-12) — cleared only on
// delivery. Dictation (FR-6) is the OS keyboard's mic writing into the same
// textarea — zero in-app code (feature-modules.md §8).
@Component({
  selector: 'app-compose',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="border-t p-2">
      <div class="mb-1 flex items-center gap-2 text-xs">
        <label class="flex items-center gap-1">
          <input type="checkbox" [checked]="ws.rawMode()" (change)="toggleRaw($event)" />
          Raw
        </label>
        @if (ws.rawMode()) {
          <span role="status" class="opacity-70">RAW — keystrokes are live</span>
        }
      </div>
      <textarea
        class="min-h-16 w-full rounded border p-2 font-mono text-sm"
        [attr.aria-label]="'Compose'"
        [value]="text()"
        (input)="setText(value($event))"
        (keydown)="onKey($event)"
        placeholder="Type or dictate…"
      ></textarea>
      @if (!ws.rawMode()) {
        <button class="mt-1 w-full rounded border p-2" [disabled]="!canSend()" (click)="send()">
          Send
        </button>
      }
    </div>
  `,
})
export class ComposeComponent {
  private readonly compose = inject(ComposeService);
  readonly ws = inject(WsClientService);
  readonly sessionId = input.required<string>();

  private sending = false;

  constructor() {
    // FR-6 + FR-12: clear the draft only once the claim is granted (the send
    // went out); on BUSY keep it. Distinguishes delivery from a standing release.
    effect(() => {
      const state = this.ws.claimState();
      if (!this.sending) return;
      if (state === 'claimed-local') {
        this.compose.clear(this.sessionId());
        this.sending = false;
      } else if (state === 'busy-other') {
        this.sending = false; // keep draft (FR-12)
      }
    });
  }

  text(): string {
    return this.compose.draft(this.sessionId())();
  }

  setText(v: string): void {
    this.compose.draft(this.sessionId()).set(v);
  }

  value(ev: Event): string {
    return (ev.target as HTMLTextAreaElement).value;
  }

  canSend(): boolean {
    return this.ws.connectionState() === 'attached' && this.text().length > 0;
  }

  send(): void {
    if (!this.canSend()) return;
    // Trailing newline → server auto-releases on the newline byte (ND-24). One
    // CLAIM → SEND → RELEASE. Explicit send only (FR-6).
    this.sending = true;
    this.ws.sendInput(encoder.encode(this.text() + '\n'));
  }

  toggleRaw(ev: Event): void {
    this.ws.setRawMode((ev.target as HTMLInputElement).checked);
  }

  onKey(ev: KeyboardEvent): void {
    if (!this.ws.rawMode()) return; // line mode: normal typing, explicit Send
    // Raw mode (FR-7): each keystroke streams as one send (ND-24). Suppress the
    // textarea's own edit so keys go to the PTY, not the buffer.
    const bytes = keyToBytes(ev);
    if (bytes) {
      ev.preventDefault();
      this.ws.sendInput(bytes);
    }
  }
}
