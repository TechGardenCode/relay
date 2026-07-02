import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { RestClient, RestError } from '../services/rest-client.service';

// FR-1 pair/auth. Full route /pair — the one route the pairStatus guard lets
// through unauthenticated (app-shell.md §4.5). Consumes the D-13 pairing artifact
// (relay://pair?url=…&token=…) via paste; the token proves itself on the first
// authenticated call (D-13 §2 probes GET /tenants/self).
//
// ponytail: paste-link only; add a getUserMedia QR scanner if the device pass
// shows paste is insufficient (D-13 offers both the deep link and plain text).
@Component({
  selector: 'app-pair',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <h1 class="text-lg font-semibold">Pair with your Relay server</h1>
      <p class="text-sm opacity-70">
        Paste the <code>relay://pair?…</code> link from <code>relay init</code>.
      </p>
      <input
        class="rounded border p-2 font-mono text-sm"
        placeholder="relay://pair?url=…&token=…"
        [value]="draft()"
        (input)="draft.set(value($event))"
        (keyup.enter)="submit()"
        [attr.aria-label]="'Pairing link'"
      />
      @if (error()) {
        <p class="text-sm" role="alert">{{ error() }}</p>
      }
      <button class="rounded border p-2" (click)="submit()" [disabled]="busy()">
        {{ busy() ? 'Pairing…' : 'Pair' }}
      </button>
    </main>
  `,
})
export class PairComponent {
  private readonly auth = inject(AuthService);
  private readonly rest = inject(RestClient);
  private readonly router = inject(Router);

  readonly draft = signal('');
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  value(ev: Event): string {
    return (ev.target as HTMLInputElement).value;
  }

  async submit(): Promise<void> {
    this.error.set(null);
    const payload = this.auth.parsePairPayload(this.draft());
    if (!payload) {
      this.error.set('That does not look like a relay://pair link.');
      return;
    }
    this.busy.set(true);
    this.auth.setPaired(payload);
    try {
      // First authenticated call proves the token (D-13 §2). A 401 clears the
      // bearer back to unpaired via RestClient (L4 §7).
      await this.rest.get('/tenants/self');
      await this.router.navigate(['/']);
    } catch (e) {
      const detail =
        e instanceof RestError ? (e.problem?.detail ?? e.message) : 'Could not reach the server.';
      this.error.set(detail);
    } finally {
      this.busy.set(false);
    }
  }
}
