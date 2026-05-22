# Relay PRD — Conceptual Model

**Status:** v0.4
**Scope:** Defines the four core entities Relay manages and the relationships between them. Read this before any of the component subdocs (`03-server.md`, `04-ide-extension.md`, `05-mobile-pwa.md`).

---

Relay has four entities. The relationships and ownership are explicit.

```
Tenant (single at MVP; data model supports many)
  ├── Global Context: skills, MCP servers, env vars, default persona
  ├── Personas: named bundles of (system prompt overlay, skill subset, MCP subset, optional model)
  └── Projects
        ├── Project Context: skills, MCP, env vars; merges with global, project wins on conflict
        ├── Project Personas: override tenant personas by name
        └── Sessions
              ├── (project_id, persona_id, agent_cli) — all immutable at MVP
              ├── agent_session_id — the agent's own session UUID (e.g., Claude Code's)
              ├── pty_pid — process running the agent under node-pty (NULL once killed)
              ├── status: running | idle | killed (terminal; see "Session status lifecycle" below)
              ├── terminated_reason — populated when status transitions to killed
              └── attachable concurrently from N clients while running
```

**Tenant.** Top-level isolation boundary. Single tenant at MVP, hidden from the user. The seam exists for later multi-user without data migration.

**Project.** A working directory (typically a git repository or worktree) registered with the server. Hard context boundary. Has its own persona definitions, skills, MCP servers, and environment variables that merge with the tenant's globals. Project identity is **1:1 with a working tree**: each git worktree is its own Relay project with its own marker file and project ID, and a multi-root VS Code workspace maps to N projects (one per root with a marker), not one — the workspace is a UX convenience, not a higher-order container.

**Persona.** A named role context: product, design, dev, test, infra, architect, review by default. Each persona bundles a system prompt overlay (appended to the agent's own prompt), an enabled subset of skills, an enabled subset of MCP servers, and optionally a preferred model. Personas are defined at the tenant level and can be overridden per project — a project-level file fully replaces the tenant-level file of the same name, no per-field merging. Persona definitions are **flat** — there is no inheritance, no `extends`, no override semantics. A user who wants the union of two personas creates a third persona whose skill and MCP subsets are that union. Composition is by selection, not by chaining. The on-disk YAML schema, file paths, and validation rules live in `09-persona-schema.md`; the behavioral guarantees Relay must uphold when applying a persona to a session are specified in `03-server.md` §4.

**Session.** A running agent CLI process bound to a specific (project, persona) pair. The session owns the PTY, persists across client disconnections, and is the unit that clients attach to. Session persona is immutable at MVP; persona changes for an ongoing conversation are deferred to Phase 3 via Claude Code's native session-resume mechanism.

**Session status lifecycle.** `running` while the agent process is alive and attachable; `idle` reserved for a future agent-driven indicator (no MVP transition uses it); `killed` once the agent process has exited for any reason (operator-killed via `relay session kill`, agent crashed, server restarted). Status `killed` is **terminal** — metadata (project, persona, transcript, `agent_session_id`) remains queryable, but the PTY is gone and the row never returns to `running`. The user starts a fresh session if they want to continue work; resuming the prior agent conversation through `claude --resume` is a Phase 3 capability.

**Server-restart contract.** A server restart kills every running agent process. On boot, the server scans SQLite for `status = running` rows and transitions each to `killed` with a `terminated_reason = "server_restart"` annotation. No auto-relaunch — the session record is preserved as historical context, not as a re-animatable thing.

*Session status semantics resolved by [D-11](../decisions/D-11-server-restart-and-session-orphaning.md) on 2026-05-15.*

*Resolved by [D-06](../decisions/D-06-persona-inheritance.md) on 2026-05-14. Persona file schema resolved by [D-09](../decisions/D-09-persona-yaml-schema.md) on 2026-05-15. Project identity (worktrees, multi-root) resolved by [ND-06](../decisions/ND-06-worktree-project-identity.md) and [ND-05](../decisions/ND-05-multi-root-workspace-marker-file-precedence.md) on 2026-05-15.*
