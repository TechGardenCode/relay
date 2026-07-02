import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';

import { RestError } from '../services/rest-client.service';
import { SessionsService } from '../services/sessions.service';

// FR-8 spawn-against-a-project — a sheet over home (app-shell.md §4.1). Pick a
// project → POST /sessions { projectId } → navigate to /sessions/:id. Existing
// contract, no new coupling.
//
// FR-9 (scratch) + FR-10 (create-project) are DEFERRED: both need server
// create-by-path, filed open at ND-41. They render disabled with the citation
// rather than calling a non-existent endpoint.
@Component({
  selector: 'app-spawn-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 flex items-end justify-center bg-black/40" (click)="closed.emit()">
      <section
        class="max-h-[70dvh] w-full max-w-md overflow-y-auto rounded-t-xl border p-4"
        (click)="$event.stopPropagation()"
      >
        <h2 class="mb-3 text-base font-semibold">Start a session</h2>

        @if (projects().length === 0) {
          <p class="text-sm opacity-70">No projects yet.</p>
        }
        @for (p of projects(); track p.id) {
          <button class="block w-full rounded border p-2 text-left" (click)="spawn(p.id)">
            {{ p.displayName }} <span class="opacity-60">({{ p.slug }})</span>
          </button>
        }

        @if (error()) {
          <p class="mt-2 text-sm" role="alert">{{ error() }}</p>
        }

        <!-- Per ND-41 (open): scratch/create-by-path needs a server pass; deferred, not wired. -->
        <div class="mt-4 border-t pt-3 text-sm opacity-50">
          <button
            class="block w-full p-1 text-left"
            disabled
            title="Requires server support (ND-41)"
          >
            + New scratch session — coming with server support (ND-41)
          </button>
          <button
            class="block w-full p-1 text-left"
            disabled
            title="Requires server support (ND-41)"
          >
            + Create project from here — coming with server support (ND-41)
          </button>
        </div>
      </section>
    </div>
  `,
})
export class SpawnSheetComponent {
  private readonly sessions = inject(SessionsService);
  private readonly router = inject(Router);

  readonly closed = output<void>();
  readonly projects = this.sessions.projects;
  readonly error = signal<string | null>(null);

  async spawn(projectId: string): Promise<void> {
    this.error.set(null);
    try {
      const session = await this.sessions.create(projectId);
      this.closed.emit();
      await this.router.navigate(['/sessions', session.id]);
    } catch (e) {
      this.error.set(
        e instanceof RestError ? (e.problem?.detail ?? e.message) : 'Could not start the session.',
      );
    }
  }
}
