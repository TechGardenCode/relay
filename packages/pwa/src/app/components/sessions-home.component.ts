import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { SessionRow, SessionsService } from '../services/sessions.service';
import { SpawnSheetComponent } from './spawn-sheet.component';

// FR-2 sessions home + FR-3 project navigation. Full route / (app-shell.md §4.1),
// default landing after auth. Two client-side IA groups — Projects (each
// expandable, FR-3) and Scratch (feature-modules.md §3). Status is the ND-43
// client-derived stopgap. The home holds no socket — it polls (ND-37).
@Component({
  selector: 'app-sessions-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SpawnSheetComponent],
  template: `
    <div class="mx-auto max-w-md p-4">
      <header class="mb-4 flex items-center justify-between">
        <h1 class="text-lg font-semibold">Sessions</h1>
        <button
          class="rounded border px-3 py-1"
          (click)="showSpawn.set(true)"
          aria-label="Start a session"
        >
          +
        </button>
      </header>

      <h2 class="mb-1 text-xs font-semibold uppercase opacity-60">Projects</h2>
      @for (group of groups().projects; track group.project.id) {
        <details class="mb-2 rounded border" open>
          <summary class="cursor-pointer p-2 text-sm font-medium">
            {{ group.project.displayName }}
            <span class="opacity-60">({{ group.sessions.length }})</span>
          </summary>
          @for (s of group.sessions; track s.id) {
            <button
              class="flex w-full items-center gap-2 border-t p-2 text-left text-sm"
              (click)="open(s)"
            >
              <span [attr.aria-label]="s.derivedStatus">{{ dot(s) }}</span>
              <span class="font-mono">{{ shortId(s.id) }}</span>
              <span class="ml-auto opacity-60">{{ ago(s.updatedAt) }}</span>
            </button>
          } @empty {
            <p class="border-t p-2 text-sm opacity-60">No sessions.</p>
          }
        </details>
      } @empty {
        <p class="mb-3 text-sm opacity-60">No projects yet.</p>
      }

      <h2 class="mb-1 mt-4 text-xs font-semibold uppercase opacity-60">Scratch</h2>
      @for (s of groups().scratch; track s.id) {
        <button
          class="flex w-full items-center gap-2 rounded border p-2 text-left text-sm"
          (click)="open(s)"
        >
          <span [attr.aria-label]="s.derivedStatus">{{ dot(s) }}</span>
          <span class="font-mono">{{ shortId(s.id) }}</span>
          <span class="ml-auto opacity-60">{{ ago(s.updatedAt) }}</span>
        </button>
      } @empty {
        <p class="text-sm opacity-60">No scratch sessions.</p>
      }
    </div>

    @if (showSpawn()) {
      <app-spawn-sheet (closed)="showSpawn.set(false)" />
    }
  `,
})
export class SessionsHomeComponent implements OnInit, OnDestroy {
  private readonly sessions = inject(SessionsService);
  private readonly router = inject(Router);

  readonly groups = this.sessions.groups;
  readonly showSpawn = signal(false);

  ngOnInit(): void {
    this.sessions.startPolling();
  }

  ngOnDestroy(): void {
    this.sessions.stopPolling();
  }

  open(s: SessionRow): void {
    void this.router.navigate(['/sessions', s.id]);
  }

  dot(s: SessionRow): string {
    return s.derivedStatus === 'running' ? '●' : '○';
  }

  shortId(id: string): string {
    return id.slice(-6);
  }

  ago(iso: string): string {
    const secs = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
    return `${Math.round(secs / 3600)}h ago`;
  }
}
