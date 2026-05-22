import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { TokenStore } from '../auth/token.store';

interface ParsedPairing {
  serverUrl: string;
  token: string;
}

interface TenantSelf {
  id?: string;
}

@Component({
  selector: 'spike-pair',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: block;
        max-width: 32rem;
        margin: 0 auto;
        padding: 1.5rem 1rem;
      }
      h1 {
        font-size: 1.4rem;
        margin: 0 0 1.5rem;
      }
      label {
        display: block;
        margin-bottom: 1rem;
      }
      label > span {
        display: block;
        color: var(--fg-dim);
        font-size: 0.85rem;
        margin-bottom: 0.35rem;
      }
      .or {
        text-align: center;
        color: var(--fg-dim);
        margin: 1rem 0;
        font-size: 0.85rem;
      }
      .row {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        margin-top: 1.5rem;
      }
      .error {
        color: var(--danger);
        margin-top: 0.75rem;
        font-size: 0.9rem;
      }
    `,
  ],
  template: `
    <h1>Pair this device</h1>

    <label>
      <span>Pairing snippet (from <code>relay init</code>)</span>
      <input
        type="text"
        autocapitalize="off"
        autocomplete="off"
        spellcheck="false"
        placeholder="relay://pair?url=http://...&token=..."
        [(ngModel)]="snippet"
      />
    </label>

    <p class="or">— or paste URL + token separately —</p>

    <label>
      <span>Server URL</span>
      <input
        type="url"
        autocapitalize="off"
        autocomplete="off"
        spellcheck="false"
        placeholder="http://100.x.y.z:3001"
        [(ngModel)]="serverUrl"
      />
    </label>

    <label>
      <span>Token</span>
      <input
        type="text"
        autocapitalize="off"
        autocomplete="off"
        spellcheck="false"
        placeholder="01HXYZ..."
        [(ngModel)]="token"
      />
    </label>

    @if (error(); as msg) {
      <p class="error">{{ msg }}</p>
    }

    <div class="row">
      <button type="button" (click)="pair()" [disabled]="busy()">
        {{ busy() ? 'Pairing…' : 'Pair' }}
      </button>
    </div>
  `,
})
export class PairComponent {
  private readonly http = inject(HttpClient);
  private readonly tokenStore = inject(TokenStore);
  private readonly router = inject(Router);

  readonly snippet = signal('');
  readonly serverUrl = signal('');
  readonly token = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  pair(): void {
    this.error.set(null);
    const parsed = this.parseInputs();
    if (parsed === null) {
      this.error.set('Need either the relay:// snippet or both URL and token.');
      return;
    }
    const probeUrl = trimTrailingSlash(parsed.serverUrl) + '/tenants/self';
    this.busy.set(true);
    // Bypass the interceptor for the probe — we don't have a paired
    // token in the store yet; pass Authorization directly.
    this.http
      .get<TenantSelf>(probeUrl, {
        headers: new HttpHeaders({ Authorization: `Bearer ${parsed.token}` }),
      })
      .subscribe({
        next: (body) => {
          this.busy.set(false);
          this.tokenStore.set({
            serverUrl: trimTrailingSlash(parsed.serverUrl),
            token: parsed.token,
            tokenId: typeof body?.id === 'string' ? body.id : null,
          });
          void this.router.navigate(['/sessions']);
        },
        error: (err) => {
          this.busy.set(false);
          if (err?.status === 401) {
            this.error.set('The server rejected this token. Re-issue with `relay token create`.');
          } else if (err?.status === 0) {
            this.error.set('Could not reach the server. Check the URL and that Tailscale is up.');
          } else {
            this.error.set(`Pairing failed: ${err?.message ?? 'unknown error'}.`);
          }
        },
      });
  }

  private parseInputs(): ParsedPairing | null {
    const snippet = this.snippet().trim();
    if (snippet.length > 0) {
      const parsed = parsePairingSnippet(snippet);
      if (parsed !== null) return parsed;
      // Fall through to URL+token fields if the snippet is malformed —
      // gives the user a path to recover without clearing the field.
    }
    const serverUrl = this.serverUrl().trim();
    const token = this.token().trim();
    if (serverUrl.length === 0 || token.length === 0) return null;
    return { serverUrl, token };
  }
}

// Per D-13: `relay://pair?url=<URL>&token=<TOKEN>`. The URL value may
// itself contain query params if quoted; the snippet format guarantees
// `url=` precedes `&token=`, so a single split on `&token=` is robust.
function parsePairingSnippet(snippet: string): ParsedPairing | null {
  const PREFIX = 'relay://pair?';
  if (!snippet.startsWith(PREFIX)) return null;
  const payload = snippet.slice(PREFIX.length);
  // Use URLSearchParams for safe decoding of percent-encoded values.
  const params = new URLSearchParams(payload);
  const url = params.get('url');
  const token = params.get('token');
  if (url === null || token === null) return null;
  return { serverUrl: url, token };
}

function trimTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}
