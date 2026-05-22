import { Injectable, signal, type Signal } from '@angular/core';

// Per D-13: token issued by `relay init` is a 26-character Crockford-Base32
// string. Pairing payload also stores the server URL so the PWA can
// address absolute endpoints (the static bundle is served by the same
// host today, but the architecture doesn't require it — see ND-29).
export interface PairedToken {
  serverUrl: string;
  token: string;
  // tokenId is opaque to the PWA but useful for matching `auth_expired`
  // frames against the currently-paired token (per ws-protocol.md §2.3).
  // Populated by the pair flow's /tenants/self probe response.
  tokenId: string | null;
}

const STORAGE_KEY = 'relay.spike-pwa.token.v1';

@Injectable({ providedIn: 'root' })
export class TokenStore {
  private readonly _state = signal<PairedToken | null>(loadFromStorage());

  readonly state: Signal<PairedToken | null> = this._state.asReadonly();

  isPaired(): boolean {
    return this._state() !== null;
  }

  set(value: PairedToken): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    this._state.set(value);
  }

  /**
   * Clear the stored token. If `byTokenId` is provided, only clear when
   * the stored token's `tokenId` matches — used by the WS auth_expired
   * flow so a token revocation for a stale tab doesn't blow away a
   * freshly-paired token in another tab.
   */
  clear(byTokenId?: string): void {
    const current = this._state();
    if (byTokenId !== undefined && current?.tokenId !== byTokenId) return;
    localStorage.removeItem(STORAGE_KEY);
    this._state.set(null);
  }
}

function loadFromStorage(): PairedToken | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<PairedToken>;
    if (typeof parsed.serverUrl !== 'string' || typeof parsed.token !== 'string') return null;
    return {
      serverUrl: parsed.serverUrl,
      token: parsed.token,
      tokenId: typeof parsed.tokenId === 'string' ? parsed.tokenId : null,
    };
  } catch {
    return null;
  }
}
