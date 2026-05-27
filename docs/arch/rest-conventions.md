# Relay Arch — REST Conventions

**Status:** v0.1
**Scope:** Response shape, status-code semantics, verb/path style, pagination, and field naming for the REST surface listed in [`prd/03-server.md`](../prd/03-server.md) §2. Closes build-plan task 2E; the style guide every route handler in `packages/server/src/server/rest/` references.

**Out of scope:** WebSocket framing ([`ws-protocol.md`](./ws-protocol.md)); auth mechanics ([`prd/03-server.md`](../prd/03-server.md) §6 — only HTTP-level status codes for auth failure are in scope here); transcript pagination shape ([ND-04](../decisions/ND-04-transcript-pagination-api-shape.md) is the authoritative spec, this doc only positions it relative to the general-list convention); rate limiting and CORS (no MVP posture); versioning (no `/v1/` prefix at MVP — mirrors [`ws-protocol.md`](./ws-protocol.md) §8 "no version field in v1").

---

## 1. Conventions at a glance

- **Errors:** RFC 9457 problem-details (`application/problem+json`).
- **Field naming:** `camelCase` for payload fields, lowercase `snake_case` for `type` / enum / error-`code` values, ISO-8601 for timestamps. Matches [`ws-protocol.md`](./ws-protocol.md) §1.
- **Collection filtering:** query parameters (`?status=killed`), not sibling collections (`/sessions/killed`). Established by [D-11](../decisions/D-11-server-restart-and-session-orphaning.md).
- **Sub-resources:** their own path only when they have a distinct representation (`/sessions/:id/transcript`, `/sessions/:id/stream`).
- **List pagination:** opaque cursor (`{ items, nextCursor }`). Transcripts are the documented exception — byte offsets per [ND-04](../decisions/ND-04-transcript-pagination-api-shape.md).
- **Created responses:** `201` + body + `Location` header. **Deleted responses:** `204`, idempotent.

## 2. Error response shape

All error responses are [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem-details documents served as `application/problem+json`. RFC 9457 obsoletes RFC 7807; field shape is identical and clarifies extension-member semantics.

**Standard members:** `type`, `title`, `status`, `detail`, `instance`. **Extensions:** flat top-level keys, `camelCase`, populated per error class.

```json
HTTP/1.1 409 Conflict
Content-Type: application/problem+json

{
  "type": "https://relay.dev/errors/project-path-taken",
  "title": "Project path already registered",
  "status": 409,
  "detail": "A project is already registered at /Users/me/work/relay.",
  "instance": "/projects",
  "canonicalPath": "/Users/me/work/relay",
  "existingProjectId": "01J7ZXY9PQ2K0M4B6F3HV8C5R7"
}
```

Rules:

- **`type`** is `https://relay.dev/errors/<kebab-slug>`. The URI is an identifier, not a fetch target — RFC 9457 §4.1 explicitly permits non-resolving URIs. The slug is the machine-readable error class; logs and tests assert on it.
- **`instance`** is the request path with path params substituted (e.g. `/projects/01J7ZXY...`), no query string. Avoids leaking filter values into logs.
- **`title`** is short, fixed per `type` (does not vary by occurrence). **`detail`** is the occurrence-specific human message.
- **Validation errors** (Zod schema failure on request body) add a `validationErrors` extension: `[{ path: "personas[0].name", code: "invalid_string", message: "..." }]`. One frame, all field errors at once.

## 3. Status codes

| Code | When | Example |
|---|---|---|
| `200 OK` | GET / PATCH success with body | `GET /sessions/:id` |
| `201 Created` | POST success creating a resource. Body = the new resource. `Location` header = its canonical URI | `POST /sessions` per [`prd/03-server.md`](../prd/03-server.md) §2 |
| `204 No Content` | DELETE success. Idempotent: re-deleting a killed session is `204`, not `404` — the row still exists per [D-11](../decisions/D-11-server-restart-and-session-orphaning.md) | `DELETE /sessions/:id` |
| `400 Bad Request` | Request is malformed: JSON parse failure, missing required field, type mismatch — Zod rejects before business logic runs | `POST /projects` with non-string `slug` |
| `401 Unauthorized` | Bearer token missing, unparseable, expired, or revoked. WWW-Authenticate: Bearer header set | Any route without `Authorization` |
| `403 Forbidden` | Token valid but lacks permission for the action. **Reserved for Phase 4 RBAC; not emitted at MVP** | — |
| `404 Not Found` | Resource does not exist for the supplied identifier | `GET /projects/:id` for unknown id |
| `409 Conflict` | State conflict: action would violate a uniqueness or state invariant. Per [D-12](../decisions/D-12-project-record-storage-and-relay-project-add-semantics.md) | `POST /projects` with an already-registered canonical path |
| `410 Gone` | **Not used at MVP.** Killed sessions remain queryable per [D-11](../decisions/D-11-server-restart-and-session-orphaning.md), so no resource has a was-deleted state on the API surface | — |
| `422 Unprocessable Entity` | Request is well-formed (Zod passed) but semantically invalid — a business rule rejects it | `POST /personas` where the YAML `name` does not match the filename stem per [D-09](../decisions/D-09-persona-yaml-schema.md) |
| `500 Internal Server Error` | Unhandled exception, programmer error. `detail` is a generic string; the real cause goes to server logs only | — |

`400` vs `422` rule: **`400` = schema rejected the request**, **`422` = business rule rejected the request**. Both are client errors, but the distinction tells the client whether to fix the payload shape or change its intent.

## 4. Verb and path conventions

- **Filter collections via query params.** `GET /sessions?status=killed` ([D-11](../decisions/D-11-server-restart-and-session-orphaning.md)), not `GET /sessions/killed`. Filters compose (`?status=killed&projectId=...`); sibling collections do not.
- **Sub-resources get their own path only when their representation differs from the parent's.** `GET /sessions/:id/transcript` (binary-bytes-as-base64) and `GET /sessions/:id/stream` (WebSocket) qualify. A "killed sessions" subset does not.
- **Verb-per-action.** `POST` creates, `GET` reads, `PATCH` mutates one or more fields of an existing resource, `DELETE` removes (or, for sessions, terminates per [`prd/03-server.md`](../prd/03-server.md) §2). No `PUT` at MVP — every mutable resource has a partial-update use case before it has a full-replacement one. No verb suffixes in paths (`/sessions/:id/kill` is wrong; `DELETE /sessions/:id` is right).

## 5. Pagination

Default for any list endpoint that grows unbounded: **opaque cursor pagination**.

```
GET /sessions?cursor=<opaque>&limit=50

{ "items": [ ... ], "nextCursor": "<opaque>" | null }
```

`cursor` is server-opaque (typically base64 of `(sortKey, id)`). `nextCursor: null` signals end of stream. No `total` field — counts are expensive on growing tables and rarely needed by clients. `limit` is server-clamped; the clamp value lives in `~/.relay/config.yaml`.

**Exception: the transcript endpoint** (`GET /sessions/:id/transcript`) uses byte-offset pagination because PTY bytes are append-only and offsets are stable for the session's lifetime. Shape locked by [ND-04](../decisions/ND-04-transcript-pagination-api-shape.md); do not relitigate.

No MVP list endpoint actually needs pagination yet (sessions, projects, personas all fit comfortably in one response). This convention exists so the first endpoint that does need it does not invent its own.

## 6. Naming

- **Payload fields:** `camelCase`. Matches [`ws-protocol.md`](./ws-protocol.md) §1 and the existing `claimLockTimeoutSeconds` / `replayBufferBytes` config keys in [`prd/03-server.md`](../prd/03-server.md) §5.
- **`type` / `code` / `status` enum values:** lowercase `snake_case` (e.g. `"project_path_taken"`, `"killed"`, `"server_restart"`).
- **Timestamps:** ISO-8601 strings, server-authoritative. Clients never assert wall-clock values to the server.

**Known inconsistency:** the transcript response example in [`prd/03-server.md`](../prd/03-server.md) §2 uses `snake_case` field names (`session_id`, `total_bytes`, `has_more`). This doc supersedes that example; the implementation will use `sessionId`, `totalBytes`, `hasMore`. A propagation entry to update the PRD snippet at implementation time will be filed in [`../decisions/index.md`](../decisions/index.md) via the decision-log skill.

## 7. Recovery guidance per error class

Every `type` code documents a **recovery path** — the next action a user takes to clear the error. The recovery copy lives here (the authoritative table) so the IDE extension's error-handler can hard-code user-facing strings keyed on the slug, and so a human reading a raw problem-details response knows what to do. A client that meets an unknown `type` falls back to rendering `detail`.

| `type` slug | Recovery path |
|---|---|
| `project-path-taken` | A project is already registered at that canonical path. Use the existing project (`existingProjectId` rides on the payload), or pass a different path. |
| `project-slug-undeducible` | The slug could not be derived from the path basename. Re-run with an explicit `--name <kebab-slug>` (CLI) / `slug` field (REST). |
| `persona-not-found` | The named persona did not resolve in the tenant or project persona dirs. Run `relay persona list` to see valid names, or `relay doctor` to surface persona files that failed to parse. |
| `session-not-found` | No session row for that id. Run `relay session list --all`; a killed session is still queryable, a never-created one is not. |
| validation error (`validationErrors` present) | One or more request fields are malformed; each entry's `path` + `message` names the field to fix. |
| `401` (auth) | The bearer token is missing, expired, or revoked. Re-pair the device, or mint a fresh token with `relay token create`. `relay doctor`'s server probe distinguishes unreachable-server from rejected-token. |

This is **documentation**, not a payload field. A machine-readable `recovery` extension member on the problem-details body was considered and **deferred** (ND-35): the `ProblemDetailsSchema` already `passthrough()`es extension members, so the field can be added non-breakingly once an in-IDE error-renderer exists to consume it (that renderer is itself deferred, gated on the extension diagnostics surface). Until then, the recovery copy is sourced from this table.

*Recovery-guidance documentation resolved by [ND-35](../decisions/ND-35-diagnostics-and-error-ux-deep-dive.md) on 2026-05-27.*

## 8. CLI clients of this surface

The `relay` CLI is a first-class consumer of these routes, but not a uniform one. Per the CLI data-plane split rule ([`repo-layout.md`](repo-layout.md) §3 `cli/`), only subcommands that mutate a live session (`relay session kill`) or reuse logic centralized in a handler (`relay project add`/`remove`) call REST over loopback; read-only and filesystem-only subcommands bypass this surface and touch SQLite/the filesystem directly. CLI REST clients consume the RFC 9457 problem-details shape (§2) and the status-code table (§3) the same way any other client does — `relay session kill` against a missing session surfaces the `404` problem-details `detail`, and an unreachable server is a distinct typed error (no fallback to direct DB mutation, which would orphan the PTY).

*CLI data-plane split rule resolved by [ND-16](../decisions/ND-16-cli-data-plane-boundary-rule.md) on 2026-05-27.*

## 9. Propagation

This doc affects:

- `packages/server/src/server/rest/` — every handler emits problem-details on error and follows the status-code table above.
- `packages/protocol/` — Zod schemas for problem-details + the `validationErrors` extension live alongside the WS frame schemas.
- [`prd/03-server.md`](../prd/03-server.md) §2 — transcript response field names need a snake-case → camelCase pass at implementation time (see §6).
- Build-plan: a sibling REST-protocol-check skill (analogue of 3D for WS) is conceivable but deferred — no entry filed yet.
