import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { WsClientService } from '../services/ws-client.service';

// FR-5 control rail. Keyless control affordances (interaction-model.md §2). Each
// maps to a fixed raw control byte sequence sent through the claim path via
// WsClientService.sendControl — which does the ND-42 claim-aware stopgap
// (send-then-release in line mode; just-send mid-stream; no release for Enter).
//
// Arrow sequences are the ND-46 normal cursor-mode stopgap (ESC [ A/B); DECCKM
// application-cursor-mode handling is unresolved — verify on the device pass.
export interface RailKey {
  label: string;
  aria: string;
  bytes: number[];
}

export const CONTROL_RAIL_KEYS: RailKey[] = [
  { label: 'Esc', aria: 'Escape', bytes: [0x1b] },
  { label: '^C', aria: 'Control C', bytes: [0x03] },
  { label: 'Tab', aria: 'Tab', bytes: [0x09] },
  { label: '↑', aria: 'Up', bytes: [0x1b, 0x5b, 0x41] }, // ESC [ A (ND-46 stopgap)
  { label: '↓', aria: 'Down', bytes: [0x1b, 0x5b, 0x42] }, // ESC [ B (ND-46 stopgap)
  { label: '⏎', aria: 'Enter', bytes: [0x0d] }, // \r — self-releasing (ND-24)
  { label: '⌥', aria: 'Plan mode (Shift+Tab)', bytes: [0x1b, 0x5b, 0x5a] }, // ESC [ Z (back-tab)
];

@Component({
  selector: 'app-control-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- In normal flow, NOT position:fixed, so the keyboard-inset handling
         applies uniformly (app-shell.md §5.1). -->
    <div class="flex justify-between gap-1 border-y p-1">
      @for (key of keys; track key.label) {
        <button
          class="min-h-11 min-w-11 flex-1 rounded font-mono text-sm"
          [attr.aria-label]="key.aria"
          [disabled]="!attached()"
          (click)="send(key)"
        >
          {{ key.label }}
        </button>
      }
    </div>
  `,
})
export class ControlRailComponent {
  private readonly ws = inject(WsClientService);
  readonly keys = CONTROL_RAIL_KEYS;
  readonly attached = () => this.ws.connectionState() === 'attached';

  send(key: RailKey): void {
    this.ws.sendControl(new Uint8Array(key.bytes));
  }
}
