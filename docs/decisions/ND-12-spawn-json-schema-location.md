---
id: ND-12
status: resolved
title: "`spawn.json` schema location"
resolved-on: 2026-05-17
affects: "docs/arch/persona-application.md §4.2, [packages/protocol/src/spawn-record.ts](../packages/protocol/src/spawn-record.ts), packages/server/src/session/spawn.ts (6E)"
surfaced-by: "build-plan 6E preflight (2026-05-17) — docs/arch/persona-application.md §4.2 names spawn.json as part of the transient session dir at ~/.relay/sessions/<sid>/ but gives no formal schema."
---

# ND-12 — `spawn.json` schema location


**Status:** resolved (2026-05-17)
**Affects:** `docs/arch/persona-application.md` §4.2, [`packages/protocol/src/spawn-record.ts`](../packages/protocol/src/spawn-record.ts), `packages/server/src/session/spawn.ts` (6E)
**Surfaced by:** build-plan 6E preflight (2026-05-17) — `docs/arch/persona-application.md` §4.2 names `spawn.json` as part of the transient session dir at `~/.relay/sessions/<sid>/` but gives no formal schema.

## Question
What is the formal schema for the `spawn.json` audit file written into `~/.relay/sessions/<sid>/` at session spawn, and where does the Zod definition live so 6E (writer) and the future `relay session inspect` (6H, reader) share a single source of truth?

## Elaboration prompt
[`docs/arch/persona-application.md`](arch/persona-application.md) §4.2 prose names `spawn.json` and describes its purpose ("records the resolved persona snapshot, argv, env names (not values), timestamps") but does not commit to field names, types, or schema-version handling. Without a formal schema, 6E will inline an ad-hoc object literal and 6H will reverse-engineer it later — the precise drift the `@relay/protocol` package exists to prevent (see [`docs/arch/repo-layout.md`](arch/repo-layout.md) §3 on the protocol package's role).

Two location options:

- **Option A — Define in `@relay/protocol` as a shared Zod schema.** New file `packages/protocol/src/spawn-record.ts` exports `SpawnRecordSchema` (Zod) and `type SpawnRecord = z.infer<typeof SpawnRecordSchema>`. 6E imports and validates writes; 6H imports and validates reads. Single source of truth; future-proof against the schema evolving (a `schemaVersion: number` field at the top discriminates readers).
- **Option B — Define inline in `session/spawn.ts` as a local TypeScript type.** Lower ceremony, but creates the drift the protocol package was designed to prevent the moment 6H lands and writes its own reader.

Proposed schema (Option A):

```ts
const SpawnRecordSchema = z.object({
  schemaVersion: z.literal(1),
  sessionId: z.string(),                              // ULID
  projectId: z.string(),                              // ULID
  personaName: z.string(),                            // kebab-case
  personaSource: z.enum(['tenant', 'project']),       // which dir the persona was loaded from
  argv: z.array(z.string()),                          // the resolved CLI argv passed to node-pty
  envNames: z.array(z.string()),                      // env var NAMES only — values are secrets per persona-application.md §4.2
  cwd: z.string(),                                    // canonical project path (per D-12)
  agentCli: z.string(),                               // e.g. 'claude'
  spawnedAt: z.string().datetime(),                   // ISO-8601 UTC
});
```

What to validate before resolving: (a) whether `personaFilePath` and the persona's content hash should be captured alongside `personaName` so a forensic reader can prove which exact file resolved (useful when the same persona name resolved differently across tenant vs project dirs); (b) whether `mcpJsonPath` (when a transient `mcp.json` is written) gets a sibling field for cross-file audit; (c) whether the `0o600` file mode on `spawn.json` matches the threat-model boundary for the transient session dir (mode `0o700` on the dir is proposed in the build-plan, this aligns).

## Resolution

**Option A.** `SpawnRecordSchema` lives in `@relay/protocol` at [`packages/protocol/src/spawn-record.ts`](../packages/protocol/src/spawn-record.ts). 6E imports it to validate writes; the future `relay session inspect` reader (deferred past 6H) imports it to validate reads. Matches the `PersonaSchema` precedent (single source of truth for a wire/disk shape, `.strict()`, top-of-file citation comment). `schemaVersion: z.literal(1)` discriminates readers if the shape ever evolves.

Sub-question answers:

- **(a) `personaFilePath` + `personaContentHash`: both included.** `PersonaInput.filePath` is already exposed by the persona loader (`packages/server/src/persona/types.ts`), so `personaFilePath` is zero-cost. `personaContentHash` is `sha256:<hex>` over the YAML bytes at spawn — proves which exact bytes resolved even if the file is later edited. 6E computes it via `crypto.createHash('sha256').update(yamlBytes).digest('hex')` from the bytes read at `personaFilePath`.
- **(b) `mcpJsonPath`: included as `z.string().nullable()`.** `null` when the persona has no `mcpServers` filter (no `mcp.json` written, per §4.2); absolute path when written.
- **(c) `0o600` on `spawn.json`: yes.** Aligns with the proposed `0o700` on the transient session dir and matches the existing transcript-sidecar pattern in 6D (`packages/server/src/transcript/writer.ts`). Owner-only readable; treats spawn metadata as private to the host user. Behavioral constraint on the 6E writer — recorded here rather than in the schema.

**Propagated to:** `packages/protocol/src/spawn-record.ts` (2026-05-17), `docs/arch/persona-application.md` §4.2 (2026-05-17).
