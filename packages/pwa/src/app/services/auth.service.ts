import { Injectable, computed, signal } from '@angular/core';

const BEARER_KEY = 'relay.bearer';
const SERVER_URL_KEY = 'relay.serverUrl';

// Per D-13 + ND-45: the pairing artifact is `relay://pair?url=<server>&token=<bearer>`.
export interface PairPayload {
  token: string;
  url: string | null;
}

export type PairStatus = 'unpaired' | 'pairing' | 'paired';

@Injectable({ providedIn: 'root' })
export class AuthService {
  // Per data-layer.md §2 + ND-45: bearer + server URL live in localStorage, read
  // at boot, cleared on unpair / 401 / WS auth reject.
  private readonly _bearer = signal<string | null>(localStorage.getItem(BEARER_KEY));
  private readonly _serverUrl = signal<string | null>(localStorage.getItem(SERVER_URL_KEY));
  private readonly _pairing = signal(false);

  readonly bearer = this._bearer.asReadonly();
  // Per ND-45: REST/WS base origin; null ⇒ same-origin fallback.
  readonly serverUrl = this._serverUrl.asReadonly();

  // Per app-shell.md §4.5: pairStatus gates every route except /pair. 'pairing'
  // is a transient flag the pair component sets mid-exchange; steady states are
  // derived from bearer presence.
  readonly pairStatus = computed<PairStatus>(() =>
    this._bearer() ? 'paired' : this._pairing() ? 'pairing' : 'unpaired',
  );

  // Per D-13 + ND-45: extract token AND server url from the pair deep link (or
  // its QR encoding). `url` is optional (same-origin deployments omit it); a
  // payload without a token is not a valid pair link.
  parsePairPayload(raw: string): PairPayload | null {
    try {
      const link = new URL(raw.trim());
      const token = link.searchParams.get('token');
      if (!token) return null;
      const url = link.searchParams.get('url');
      return { token, url: url && url.length > 0 ? url : null };
    } catch {
      return null; // not a URL
    }
  }

  setPaired(p: PairPayload): void {
    localStorage.setItem(BEARER_KEY, p.token);
    if (p.url) localStorage.setItem(SERVER_URL_KEY, p.url);
    else localStorage.removeItem(SERVER_URL_KEY);
    this._pairing.set(false);
    this._serverUrl.set(p.url);
    this._bearer.set(p.token);
  }

  setPairing(): void {
    this._pairing.set(true);
  }

  clear(): void {
    localStorage.removeItem(BEARER_KEY);
    localStorage.removeItem(SERVER_URL_KEY);
    this._pairing.set(false);
    this._serverUrl.set(null);
    this._bearer.set(null);
  }
}
