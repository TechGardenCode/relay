import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import type { Session, SessionListResponse } from '@relay/protocol';

import { TokenStore } from '../auth/token.store';

@Component({
  selector: 'spike-sessions-list',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: block;
        max-width: 48rem;
        margin: 0 auto;
        padding: 1.5rem 1rem;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1rem;
      }
      h1 {
        margin: 0;
        font-size: 1.4rem;
      }
      .empty,
      .error,
      .loading {
        padding: 2rem 0;
        color: var(--fg-dim);
        text-align: center;
      }
      .error {
        color: var(--danger);
      }
      ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      li {
        background: var(--bg-elev);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        margin-bottom: 0.6rem;
        padding: 0.85rem 1rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      li:active {
        background: #1c2128;
      }
      .name {
        font-weight: 600;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .meta {
        color: var(--fg-dim);
        font-size: 0.85rem;
      }
      .pill {
        display: inline-block;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        background: rgba(46, 160, 67, 0.18);
        color: #56d364;
      }
    `,
  ],
  template: `
    <header>
      <h1>Sessions</h1>
      <button type="button" (click)="refresh()" [disabled]="loading()">Refresh</button>
    </header>

    @if (loading()) {
      <p class="loading">Loading…</p>
    } @else if (error(); as msg) {
      <p class="error">{{ msg }}</p>
    } @else if (sessions().length === 0) {
      <p class="empty">No running sessions. Start one from the laptop.</p>
    } @else {
      <ul>
        @for (s of sessions(); track s.id) {
          <li (click)="open(s)">
            <div style="flex:1; overflow:hidden;">
              <div class="name">{{ s.personaName }}</div>
              <div class="meta">
                {{ s.agentCli }} · {{ s.updatedAt | date: 'short' }} · {{ s.totalBytes }} bytes
              </div>
            </div>
            <span class="pill">{{ s.status }}</span>
          </li>
        }
      </ul>
    }
  `,
})
export class SessionsListComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly tokenStore = inject(TokenStore);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly sessions = signal<Session[]>([]);

  constructor() {
    this.refresh();
  }

  refresh(): void {
    this.error.set(null);
    this.loading.set(true);
    const paired = this.tokenStore.state();
    if (paired === null) {
      this.loading.set(false);
      return;
    }
    this.http.get<SessionListResponse>(`${paired.serverUrl}/sessions?status=running`).subscribe({
      next: (resp) => {
        this.loading.set(false);
        this.sessions.set(resp.items);
      },
      error: (err) => {
        this.loading.set(false);
        if (err?.status === 401) {
          this.tokenStore.clear();
          void this.router.navigate(['/pair']);
          return;
        }
        this.error.set(`Failed to load sessions: ${err?.message ?? 'unknown error'}.`);
      },
    });
  }

  open(s: Session): void {
    void this.router.navigate(['/sessions', s.id]);
  }
}
