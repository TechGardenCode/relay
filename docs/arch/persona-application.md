# Relay Arch — Persona Application Mechanism

> **Deferred to Phase 2 per [D-17](../decisions/D-17-personas-descoped-from-mvp.md) (2026-05-28).** Personas are descoped from the MVP. The mechanism below (Claude Code flags + transient `~/.relay/sessions/<sid>/` artifacts) is **not on the MVP spawn path**: `SessionRegistry.create()` takes no persona and spawns a bare agent with an empty argv — no `--append-system-prompt`, `--model`, `--mcp-config`, `--strict-mcp-config`, or `--disable-slash-commands`. `buildArgv`/`hashPersonaFile` were removed from `session/spawn.ts`. Read the body as the Phase 2 design, not current MVP behavior.

**Status:** v0.1
**Scope:** Picks the concrete mechanism Relay uses to apply a persona to a spawned agent session, subject to the three D-G1 guarantees (lifetime, isolation, invisibility). Closes build-plan task 2A.

**Out of scope:** Persona content authoring (build-plan 1A), transcript capture (covered at the PTY layer by D-07, independent of this decision), credential propagation (D-10 — covered by server env pass-through), the persona YAML schema itself (D-09 / `prd/09-persona-schema.md`).

---

## 1. The decision in one paragraph

Relay applies a persona by composing **Claude Code CLI flags at session spawn**, with **transient per-session artifacts written under `~/.relay/sessions/<sessionId>/`** for inputs that don't fit on a command line (a filtered MCP config, primarily). Nothing about persona application touches the project working directory — no synthetic `CLAUDE.md`, no shadowed `~/.claude/` paths, no in-project marker beyond what `prd/04-ide-extension.md` already specifies for project binding. The agent process is spawned in the project working directory exactly as a developer would invoke `claude` themselves; the persona is layered on through flags and a transient config dir Relay owns.

This is a **hybrid mechanism**: CLI flags are primary; the transient session dir is the escape hatch for things flags can't carry literally (multi-line file content, structured JSON, native config that needs filtering before pass-through).

---

## 2. Candidate mechanisms considered

Four shapes were on the table, plus the v0.3 PRD's already-rejected approach for context:

### 2.a Claude Code CLI flags (primary candidate)

Pass persona fields as CLI flags at `node-pty` spawn time:

- `--append-system-prompt <content>` — appends a string to Claude's default system prompt. The persona's `systemPrompt` field maps here.
- `--model <id>` — overrides the agent's default model. The persona's `model` field maps here.
- `--mcp-config <path>` plus `--strict-mcp-config` — load only the MCP servers from a specific JSON config file, ignoring all others. The persona's `mcpServers` filter maps here (with a transient config file, see 2.b).
- `--disable-slash-commands` — disable all skills (matches the literal `skills: []` empty-list case).
- `--add-dir`, `--allowedTools`, `--disallowedTools`, `--setting-sources`, `--settings`, `--plugin-dir`, `--agents` — additional knobs available if needed; not currently used for persona application.

The flags Claude Code already exposes cover the three persona fields cleanly except `skills` when the list is non-empty (see §6).

### 2.b Transient per-session config dir under `~/.relay/sessions/<sessionId>/`

Relay writes a per-session scratch directory at spawn time:

```
~/.relay/sessions/<sessionId>/
├── mcp.json              # filtered MCP server set (when persona constrains mcpServers)
├── spawn.json            # the persona snapshot, agent CLI command line, env, timestamps (audit/debug)
└── (other transient files as needed)
```

The mechanism mode is "owned by Relay, lives under `~/.relay/`, fully invisible to the project working directory." Files are written before the agent is spawned and cleaned up on session termination (kept for some retention window for debugging, settled by the storage policy doc — not in scope here).

Critically, this directory is **not** the agent's working directory. The agent still runs in the project's actual canonical path (per D-12). The transient dir holds artifacts that get **referenced by absolute path** in CLI flags.

### 2.c Environment variables read by the agent at start

Pass persona context through process env. Claude Code does consume some env vars (`HOME` for Linux OAuth state lookup, `ANTHROPIC_API_KEY` for headless auth, debug toggles), but there is no documented env var that injects a system-prompt fragment, restricts skills, or filters MCP servers. The native env surface is for auth and runtime tuning, not behavior shaping.

This option would require Relay to invent its own env vars and either patch the agent CLI (out of scope) or rely on a wrapper script — both of which couple Relay tightly to internals Claude Code does not guarantee. The flags exist precisely to avoid this; using env vars for persona application would re-invent the same wheel less cleanly.

### 2.d Transient working directory with a synthetic CLAUDE.md

Relay creates `~/.relay/sessions/<sessionId>/cwd/` with a synthetic `CLAUDE.md` containing the persona's system prompt and spawns the agent there.

The mechanism's invisibility holds — the project dir is untouched. But it **breaks every other workflow assumption**: the agent's `pwd` is no longer the project, so file paths in user prompts are relative to a transient dir, every Edit and Read tool call needs an absolute path resolved against a project that the agent only sees through `--add-dir`, and the developer's intuition that "the agent is working in my repo" stops being true. The project's own `CLAUDE.md` also stops being auto-discovered (auto-discovery walks up from `cwd`), so project-level instructions silently disappear from the system prompt unless Relay re-introduces them, which it shouldn't — that's the project's contract with Claude Code, not Relay's to mediate.

This is structurally close to the v0.3 PRD's CLAUDE.md mutation approach (just relocated). Same brittleness, same race-condition surface if Relay regenerates the synthetic file mid-session, plus a new failure mode (the agent works in the wrong directory).

### 2.e v0.3 PRD's CLAUDE.md mutation (already rejected; included for completeness)

Mutating `<project>/CLAUDE.md` at spawn and restoring it at session end was the v0.3 approach. D-G1's framing exists because this approach was ruled out for (1) race conditions when `/compact` re-reads the file mid-session, (2) cross-session pollution when two sessions in the same project disagree on persona, and (3) visible project-directory mutation. Not under consideration; listed only so reviewers can confirm we are not re-introducing it.

---

## 3. Per-mechanism check against D-G1

| Mechanism | Lifetime | Isolation | Invisibility | Notes |
|---|---|---|---|---|
| **2.a CLI flags only** | ✓ Set at spawn, baked into the process; the agent process keeps them for its full lifetime. Persists across `/compact` because `/compact` summarizes the conversation, not the system prompt. | ✓ Per-process; concurrent sessions on the same project get independent argv. | ✓ Nothing written to the project. | The only gap is `skills:` when non-empty — see §6. |
| **2.b Transient dir under `~/.relay/`** | ✓ Files are read by the agent at spawn (for `--mcp-config`); Claude Code holds the resulting in-memory state for the session. | ✓ Per-session subdirectory; no cross-session contention. | ✓ Lives under `~/.relay/`, never inside the project. | Cleanup policy is a separate decision; stale dirs are cosmetic, not corrupting. |
| **2.c Environment variables** | ✗ Partial: no native env surface for prompt/skills/MCP. Inventing one couples Relay to Claude Code internals. | ✓ Per-process env is naturally isolated. | ✓ Env is not project-visible. | Rejected because the native surface doesn't exist; using env would either duplicate flag functionality or require unsupported internals. |
| **2.d Transient cwd + synthetic CLAUDE.md** | ✓ The synthetic file is read at spawn and on `/compact` re-reads — but those re-reads now see a stable Relay-owned file, not a project file. | ✓ Per-session cwd. | ✓ Synthetic file lives under `~/.relay/`. | **Rejected for a different reason than D-G1:** breaks developer workflow because `pwd` is no longer the project. |
| **2.e Project CLAUDE.md mutation** | ✗ `/compact` re-reads can race with restore. | ✗ Two sessions in the same project clobber each other. | ✗ Project-visible file mutation. | Already rejected by D-G1's framing. |

Picked: **2.a primary, 2.b for the inputs flags can't carry literally.**

---

## 4. The picked mechanism in detail

### 4.1 What runs at session spawn

```
cd <project canonical path>
<HOME, ANTHROPIC_API_KEY if set, and other agent-CLI native vars inherited from Relay's process env per D-10/ND-19>
claude \
  [--model <persona.model>]                                # only if persona sets model
  [--append-system-prompt <persona.systemPrompt>]          # only if persona sets systemPrompt
  [--mcp-config ~/.relay/sessions/<sid>/mcp.json --strict-mcp-config]   # only when filtering mcpServers
  [--disable-slash-commands]                               # only when persona.skills == []
```

The agent runs under `node-pty` so the PTY-layer transcript capture (D-07) is unaffected. Working directory is the project's canonical path (D-12). Env is the parent process env per D-10; OAuth-via-`$HOME` is the documented default per ND-19 (Keychain on macOS, `~/.claude/.credentials.json` on Linux), and `ANTHROPIC_API_KEY` rides through when set. Relay does not synthesize new env vars for persona application.

If a persona has no `systemPrompt`, no `model`, no `mcpServers` constraint, and no empty `skills:`, the spawn command is just `claude` and the agent runs with all of its native defaults. The persona is the *delta* from native; an empty persona is a no-op.

*Credential surface default resolved by [ND-19](../decisions/ND-19-claude-login-oauth-as-the-documented-credential-default-anthropic-api-key-as-fallback.md) on 2026-05-18.*

### 4.2 Transient session dir

```
~/.relay/sessions/<sessionId>/
├── mcp.json     # written when persona.mcpServers is set, never otherwise
└── spawn.json   # always written; records the resolved persona snapshot, argv, env names (not values), timestamps
```

`mcp.json` is built by reading the agent CLI's native MCP config (`~/.claude.json` and `<project>/.mcp.json` per the persona schema and `prd/03-server.md` §8), filtering to only the entries named in `persona.mcpServers`, and writing the filtered structure to the transient path. The agent loads that file under `--strict-mcp-config`, which means **only** those MCP servers are available for the session. The persona's filter has the final word; nothing is added that the persona did not list, and nothing the persona listed is silently dropped (a listed name that doesn't resolve against the native config is a validation error — see §6 failure modes).

`spawn.json` is operational metadata, not a runtime input — Relay reads it for debugging and for the `relay session inspect` flow (which doesn't exist yet). Including it here documents that the transient dir is the natural place for per-session audit material, not just MCP config.

The formal shape is defined as `SpawnRecordSchema` in [`packages/protocol/src/spawn-record.ts`](../../packages/protocol/src/spawn-record.ts); 6E validates writes against it and the future `relay session inspect` reader validates reads against it. The `0o600` mode on `spawn.json` (and `0o700` on the parent dir) is the host-user-private threat-model boundary. *Resolved by [ND-12](../decisions/ND-12-spawn-json-schema-location.md) on 2026-05-17.*

### 4.3 `agentSessionId` capture

Claude Code persists each session as a JSONL file under `~/.claude/projects/<encodedPath>/<sessionId>.jsonl`, where `encodedPath` is the project's canonical absolute path with every `/` replaced by `-` (the leading `/` becomes a leading `-`). The session id never appears on stdout or stderr — it is only the filename stem. To populate the optional `agentSessionId` field on the WS [`hello`](ws-protocol.md) frame, `session/` discovers the id via filesystem polling, not byte-stream scanning:

1. **Pre-spawn snapshot.** Before invoking `node-pty`, the orchestrator records the set of existing `.jsonl` filenames in `~/.claude/projects/<encodedPath>/`. If the directory does not exist, the snapshot is the empty set.
2. **Post-spawn poll.** Every 250 ms for up to 30 s, the orchestrator re-reads the directory and looks for a newly-appearing entry that matches **both** conditions: ends in `.jsonl` AND has a UUID-shaped stem (`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`, case-insensitive). The first such entry's stem is written to `sessions.agent_session_id` via the `store/sessions.ts` repository.
3. **Timeout is non-fatal.** If no matching file appears within 30 s, `sessions.agent_session_id` stays `NULL`. The `hello` frame then omits `agentSessionId` entirely (matching the field's "optional" wording in `ws-protocol.md` §2.3). No error is surfaced to the client; the session continues normally.

The dual filter is necessary because Claude Code creates three kinds of entries in the project directory: `<uuid>.jsonl` files (the capture target), bare-UUID directories with the same stem (sidecar storage), and a `memory/` directory. Either condition alone would misfire.

Polling cadence (250 ms) and timeout (30 s) are hardcoded constants in `packages/server/src/session/agent-session-id.ts`; they are not exposed in `~/.relay/config.yaml` or the persona schema.

*Resolved by [ND-11](../decisions/ND-11-agentsessionid-capture-mechanism.md) on 2026-05-17.*

### 4.4 Why this and not flags-only

Flags-only would require either embedding the entire native MCP config inline in `--mcp-config` (which accepts JSON strings, but argv length and quoting make this brittle for any non-trivial set), or pointing `--mcp-config` at the native files directly without filtering — which defeats the persona's MCP restriction entirely.

Writing a filtered MCP config to a transient path is the smallest deviation from flags-only that lets the persona schema's `mcpServers` field actually constrain the session. The transient dir naturally extends to other future per-session inputs as Claude Code or the persona schema grows.

### 4.5 Why this and not transient-cwd

The agent's working directory matters to the developer. Every Read, Edit, Glob, and Bash call the agent makes resolves relative to its cwd. If Relay puts the agent in a scratch dir and tries to compensate via `--add-dir`, the agent's tool calls work but the developer's mental model — "the agent is at the project root" — quietly stops being true, with confusing path output in transcripts and broken assumptions in any custom skill that does `pwd`. The flags-and-flat-config approach keeps the agent in the project, exactly where the developer would run `claude` by hand.

---

## 5. Mapping D-09 schema fields onto the mechanism

| Persona field | Mechanism | Notes |
|---|---|---|
| `name` | (none — identity only) | Stored on the session row; not passed to the agent. |
| `description` | (none — UI only) | Surfaced by the IDE quick-pick per `prd/09-persona-schema.md`. |
| `schemaVersion` | (none — validation only) | Checked on YAML load; never reaches the agent. |
| `systemPrompt` | `--append-system-prompt <content>` | Multi-line string passed literally. argv length is bounded by OS limits (≥128 KB on macOS and Linux); the persona authoring guide will surface this if anyone hits it. Beyond that ceiling, fall back to a transient file + `--append-system-prompt-file` (the file-variant flag exists per Claude Code's help). |
| `model` | `--model <id>` | Direct pass-through. Omitted → flag not added, agent CLI default applies. |
| `skills` (omitted / `null`) | (no flag) | Agent native skill discovery applies; persona is permissive. |
| `skills: []` (explicitly empty) | `--disable-slash-commands` | Hard-disable all skills for the session. |
| `skills: [a, b, ...]` (non-empty list) | **Partial fit — see §6.1.** | No native CLI flag exposes "allow only this subset of skills"; the field is treated as advisory at MVP, documented as such, and the implementation gap is filed as a sub-question. |
| `mcpServers` (omitted / `null`) | (no flag) | Agent loads its native MCP set. |
| `mcpServers: []` (explicitly empty) | `--mcp-config ~/.relay/sessions/<sid>/mcp.json --strict-mcp-config` with an empty `mcpServers` object in the file | The empty-but-strict combination yields zero MCP servers. |
| `mcpServers: [a, b, ...]` | Filtered transient config + `--mcp-config` + `--strict-mcp-config` | See §4.2. |

The mapping holds the schema's "omitted = all, empty list = none, populated list = exactly these" semantics for both list fields.

---

## 6. Failure modes and known gaps

### 6.1 Skill restriction has a partial fit

Claude Code does not currently expose a CLI flag that says "allow only this subset of named skills." The available primitives are:

- `--disable-slash-commands` — all-or-nothing off switch.
- `--plugin-dir <path>` — adds a session-scoped plugin directory, but adds rather than restricts.
- `--add-dir`, `--allowedTools`, `--disallowedTools` — operate on tools and filesystem scope, not on the skill registry.

This leaves two viable postures for non-empty `skills:` lists at MVP:

1. **Treat `skills:` as advisory.** The agent has access to all skills discoverable in `~/.claude/skills/` and `<project>/.claude/skills/`; the persona's listed subset is enforced only by the system-prompt narration (e.g., "you have access to the following skills: …"). This is honest, doesn't pretend a restriction is in place that isn't, and is the path of least implementation cost.
2. **Curate a transient skill directory.** Symlink only the listed skill subdirectories into `~/.relay/sessions/<sid>/skills/` and use Claude Code's native skill-discovery override (if/when a flag like `--skills-dir` or equivalent is added). Implementable today via filesystem composition, but couples Relay to the directory layout Claude Code discovers.

The architectural decision between these — or a third option that emerges — is filed as a new sub-question (see §8 below).

### 6.2 `/compact` and `/resume` behavior

`/compact` summarizes the conversation in place. It does not re-source the system prompt or re-parse CLI flags; both are part of the agent process's startup state. Persona application via `--append-system-prompt` and `--model` therefore **survives `/compact`** without action from Relay.

`/resume` is Phase 3 (per D-11's deferral) and is a fresh process spawn. Resume is "spawn a new agent with the prior `agent_session_id` and replay the conversation" — Relay re-applies the persona on the resume spawn the same way it does on the initial spawn. The persona snapshot in `spawn.json` (§4.2) is what Relay reads to reconstruct the argv on resume. This means a session's persona is the persona that was active at the most recent spawn, not at the original spawn — if the persona definition has been edited since the session was first started, resume picks up the edits. The MCP-set lifecycle rule (D-03 / `prd/03-server.md` §9) already implies this behavior for MCP servers; persona-application extends the same "fixed at spawn, refreshed on respawn" model to all persona fields.

### 6.3 Crash / agent-process restart

If the agent process dies mid-session and Relay respawns it (Phase 3 capability; not in Phase 1 — D-11 commits to "no auto-relaunch"), the new process is a fresh spawn under the same `agent_session_id`. The same persona-application argv is reconstructed from `spawn.json`. No special path; same as `/resume`.

### 6.4 Concurrent sessions in the same project with different personas

This is the case D-G1 isolation was designed to protect, and the picked mechanism passes it cleanly. Two sessions on the same project working directory get two independent `node-pty` spawns with independent argv. Nothing about the project directory is read or written by Relay during persona application. Both agents see the project's actual `CLAUDE.md` (unchanged by Relay), apply their respective `--append-system-prompt` content independently, and consume their respective transient MCP configs from disjoint `~/.relay/sessions/<sid>/` directories.

### 6.5 Persona name resolves but a referenced skill or MCP server doesn't

A persona may reference an MCP server that isn't in the user's native `~/.claude.json` (e.g., persona was authored against a different machine's config). Two viable failure modes:

1. **Hard fail at spawn.** Reject the `POST /sessions` request with a 422 listing the unresolved names. Honest and immediate; the user fixes either the persona or their native config and retries.
2. **Soft fail with warning.** Spawn anyway, emit a warning in the session log and the IDE/CLI surface, but proceed with the resolvable subset.

Hard fail is the more honest default for MCP servers (a listed-but-missing MCP server is a configuration error, not a benign omission). The exact policy choice is implementation detail rather than architecture — capture it during implementation if anyone cares to formalize it; otherwise the implementation can ship with hard-fail and we revisit only if friction surfaces. Not currently filed as a sub-question.

### 6.6 Diagnosing a persona that didn't load

Persona-load failure stays **non-fatal** (D-G1): a persona YAML with a syntax or schema error is *excluded* per D-09 §4 — the server does not crash and other personas still load — and an `agentSessionId` that never gets captured leaves the field `NULL` (ND-11) without surfacing an error to the client. The diagnostic surface for this class is the `relay doctor` command: its persona-parse probe runs the tenant persona directory through the same `loadPersonasFromDirectory` loader the server uses and lists any file that failed to load with its `PersonaLoadReason`, so a typo is a named diagnostic instead of an invisible exclusion. `relay persona list` already prints invalid files to stderr, and the `~/.relay/sessions/<sid>/spawn-record.json` audit (ND-12) records which persona file actually resolved for a given session. Making persona-load fatal, or adding a "persona did not apply" field to the session record that the IDE renders, were both considered and **deferred** — the first would change this non-fatal contract (and a one-file typo should not refuse to boot the server), the second is a multi-surface feature for a rare failure.

*Persona-load diagnostics surface resolved by [ND-35](../decisions/ND-35-diagnostics-and-error-ux-deep-dive.md) on 2026-05-27; the D-G1 non-fatal contract is unchanged.*

---

## 7. Sketch of the data flow at spawn

```
POST /sessions { projectId, personaName, ... }
        │
        ▼
[server] resolve persona:
   load <project>/.relay/personas/<name>.yaml      ← project file wins per D-09 §3
   else load ~/.relay/personas/<name>.yaml
   validate against schema (D-09 §4)
        │
        ▼
[server] resolve MCP filter (only if persona.mcpServers is set):
   read native ~/.claude.json + <project>/.mcp.json
   filter to entries whose key ∈ persona.mcpServers
   write filtered structure to ~/.relay/sessions/<sid>/mcp.json
        │
        ▼
[server] build argv:
   ["claude",
    ...(persona.model ? ["--model", persona.model] : []),
    ...(persona.systemPrompt ? ["--append-system-prompt", persona.systemPrompt] : []),
    ...(mcpFilterUsed ? ["--mcp-config", mcpPath, "--strict-mcp-config"] : []),
    ...(persona.skills === [] ? ["--disable-slash-commands"] : [])]
        │
        ▼
[server] write spawn.json with the snapshot
        │
        ▼
[server] node-pty.spawn(cmd, argv, { cwd: project.canonical_path, env: { ...processEnv } })
        │
        ▼
[agent] running with persona applied, transcript flowing via PTY (D-07)
```

The project working directory is touched zero times by this flow. Everything Relay writes lives under `~/.relay/sessions/<sid>/`.

---

## 8. Surfaces a new sub-question

**ND-08 (proposed): Skill subset enforcement mechanism.** Claude Code's current CLI flags do not let Relay say "this session may use these N named skills and no others." The persona schema's `skills:` non-empty-list semantics need an enforcement story before the Phase 1 acceptance for personas with curated skill subsets is meaningful. Options to evaluate at decision time include (a) treat as advisory at MVP and document the gap, (b) curate a transient skill directory and propose a `--skills-dir` flag upstream to Claude Code, or (c) some plugin-dir composition that achieves the same scoping today.

This entry should be filed in `../decisions/index.md` as an ND-* sub-question under D-G1 / D-09 when the decision-log skill next runs.

---

## 9. Implementation notes for the persona module

These belong eventually in `packages/server/src/persona/CLAUDE.md` (build-plan 5D), not here, but worth recording while the mechanism is fresh:

- The persona module's contract is "given a persona name + project context, return argv fragments + side-effect a transient session dir." It does not spawn; it composes inputs for whoever does.
- The MCP-filter step is the only place persona application reads from native Claude Code config files; that read is the seam that the native-configuration-preservation principle (`prd/03-server.md` §8) bears on directly.
- Validation must run before any side-effect: an invalid persona is excluded per D-09 §4, and an invalid MCP filter must not leave a half-written transient file.
- Tests use fixture YAML personas and fixture `~/.claude.json` content from the test-isolation pattern in `repo-layout.md` §3.

---

*Resolves the implementation question raised by [D-G1](../decisions/D-G1-persona-application-semantics.md) and ties to [D-03](../decisions/D-03-mcp-set-changes-mid-session.md), [D-09](../decisions/D-09-persona-yaml-schema.md), [D-10](../decisions/D-10-agent-model-credentials-handling.md), [D-11](../decisions/D-11-server-restart-and-session-orphaning.md), [D-12](../decisions/D-12-project-record-storage-and-relay-project-add-semantics.md).*
