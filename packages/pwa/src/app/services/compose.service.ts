import { Injectable, WritableSignal, signal } from '@angular/core';

// Per feature-modules.md §4.3 + FR-6: one draft per session. Per FR-12 the draft
// is preserved across BUSY — nothing here clears it except an explicit send
// success or clear().
@Injectable({ providedIn: 'root' })
export class ComposeService {
  private readonly drafts = new Map<string, WritableSignal<string>>();

  draft(sessionId: string): WritableSignal<string> {
    let s = this.drafts.get(sessionId);
    if (!s) {
      s = signal('');
      this.drafts.set(sessionId, s);
    }
    return s;
  }

  clear(sessionId: string): void {
    this.drafts.get(sessionId)?.set('');
  }
}
