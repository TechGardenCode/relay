---
id: ND-07
status: resolved
title: "Marker file schema"
resolved-on: 2026-05-15
affects: "prd/04-ide-extension.md §4"
surfaced-by: "[[d-g6-project-discovery--workspace-to-project-binding]] resolution"
---

# ND-07 — Marker file schema


**Status:** resolved (2026-05-15)
**Affects:** `prd/04-ide-extension.md` §4
**Surfaced by:** [[d-g6-project-discovery--workspace-to-project-binding]] resolution

## Question
What fields does `.relay/project.json` contain? D-G6 commits to at-minimum a project ID; the rest of the schema (server URL, display name, schema version, forward-compat behavior) is open.

## Resolution
**Two required fields (`schemaVersion`, `projectId`) plus optional `serverUrl` and `displayName`. Unknown future versions are a refuse-to-bind condition with a clear upgrade prompt.**

```json
{
  "schemaVersion": 1,
  "projectId": "01HXYZ...",
  "serverUrl": "https://relay.homelab.lan",
  "displayName": "relay (main worktree)"
}
```

1. **Required: `schemaVersion`.** Integer. The forward-compat signal — see rule 5 for the version-mismatch behavior. MVP value is `1`.
2. **Required: `projectId`.** String. The opaque server-issued identifier created when the project was registered. ULID or UUID at the implementation's discretion.
3. **Optional: `serverUrl`.** String. The full base URL of the Relay server that issued `projectId`. Useful when a user has multiple Relay servers paired in the same IDE (e.g., personal homelab plus work bastion). When absent, the extension falls back to whichever server it was configured against at first-run.
4. **Optional: `displayName`.** String. A human-readable label the extension uses in UI surfaces (status bar, quick-pick) when the server is unreachable for a live lookup. Otherwise the server's authoritative display name wins.
5. **Forward-compat: refuse to bind on unknown `schemaVersion`.** If the extension reads a `schemaVersion` higher than it recognizes, it does not bind, does not attempt graceful degradation, and surfaces a clear "this marker was written by a newer Relay extension; please update to bind" notification. Graceful degradation risks silent misinterpretation of fields the older client doesn't understand.
6. **Unrecognized fields at the current `schemaVersion`.** Ignored. A `schemaVersion: 1` reader that finds extra fields it doesn't know still binds.

**Why refuse-to-bind on unknown version (not graceful-bind-with-warning):** The marker is the *only* authoritative bind signal per [[d-g6-project-discovery--workspace-to-project-binding]]. Binding against an unknown schema means risking field-semantic drift (e.g., `projectId` becoming a structured object in v2). A hard refusal with a clear "upgrade your extension" prompt is unambiguous and short-lived — users update extensions on a normal cadence.

**Propagated to:** `prd/04-ide-extension.md` §4 (2026-05-15).
