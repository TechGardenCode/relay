---
id: ND-31
status: open
title: "SecretStorage key namespace for multi-server IDE pairing"
affects: "packages/extension/src/pairing.ts (SecretStorage write key shape on first-run pairing); packages/extension/src/discovery.ts (per-root marker bind behavior when marker.serverUrl does or does not match stored credentials); packages/extension/src/restClient.ts (which (url, token) pair the REST client picks per request); docs/prd/04-ide-extension.md §4 First-run configuration paragraph + Marker file paragraph (the multi-server case the resolution finalizes)."
surfaced-by: "relay-architect review during 6I IDE extension pre-code review (2026-05-22) — see the 6I PR for the full architect verdict."
---

# ND-31 — SecretStorage key namespace for multi-server IDE pairing


**Status:** open
**Affects:** `packages/extension/src/pairing.ts` (SecretStorage write key shape on first-run pairing); `packages/extension/src/discovery.ts` (per-root marker bind behavior when `marker.serverUrl` does or does not match stored credentials); `packages/extension/src/restClient.ts` (which `(url, token)` pair the REST client picks per request); `docs/prd/04-ide-extension.md` §4 First-run configuration paragraph + Marker file paragraph (the multi-server case the resolution finalizes).
**Surfaced by:** relay-architect review during 6I IDE extension pre-code review (2026-05-22) — see the 6I PR for the full architect verdict.

## Question

When the IDE extension has paired with multiple Relay servers (per [[nd-07-marker-file-schema]]'s optional `serverUrl` field — the architect's "homelab + work bastion" case), how are `(serverUrl, token)` pairs keyed in `vscode.SecretStorage`, and what does the extension do at startup when binding a marker whose `serverUrl` has no stored credentials?

## Context

[[d-13-first-run-pairing-ux]] rule 2 says only "stores the values in VS Code secret storage." [[d-13-first-run-pairing-ux]] rule 4 ("tokens are long-lived and reusable. … The same token can pair multiple devices") addresses "one token, N devices, one server" but is silent on "one device, N servers." [[nd-07-marker-file-schema]] rule 3 explicitly admits the multi-server case ("useful when a user has multiple Relay servers paired in the same IDE — e.g., personal homelab plus work bastion") and defines `serverUrl` as the per-marker disambiguator, but does not pin extension behavior when the marker's `serverUrl` has no stored credentials.

6I ships with a Phase-1 single-server posture: `relay.serverUrl` + `relay.token` are the two SecretStorage keys. When the extension reads a marker carrying a `serverUrl` that does not match the stored `relay.serverUrl`, it surfaces "Relay: pair with this server first" and refuses to bind that root. This is consistent with [[nd-07-marker-file-schema]] rule 5 (refuse-to-bind on uncertainty) but is not a full multi-server design — it forces the operator into a single-server workflow for any given IDE install.

The resolution needs to decide whether the multi-server case is in scope for Phase 1 (with the IDE rewrite to per-server keys), Phase 2 (with a documented "one server per IDE install" limitation at MVP), or never (single-server-per-install is the canonical posture and ND-07's `serverUrl` field exists only to confirm-the-bind, not to drive a multi-server UX).

## Elaboration prompt

What to land in this resolution:

- **(a) Phase scope.** Decide whether multi-server pairing is a Phase 1 requirement that needs to land before 6I ships, a Phase 2 follow-on (after 6I ships with single-server keys), or a permanent non-feature. The PRD ([`prd/04-ide-extension.md`](../prd/04-ide-extension.md) §4) is currently ambiguous — it admits the case via [[nd-07-marker-file-schema]] but does not commit to extension support timing. Pick one and align the subdoc.
- **(b) Key shape.** If multi-server is in scope, propose the SecretStorage key namespace. Strawman: `relay.server.<sha256(serverUrl).slice(0, 16)>.token` (per-server-URL-hashed token) and `relay.servers` → JSON array of `{ urlHash, urlPlain }` so the extension can enumerate paired servers without scanning SecretStorage. Decide whether to hash the URL (privacy-preserving against a SecretStorage dump leak) or store the URL plaintext as the key (simpler, slightly worse on dump leaks). VS Code SecretStorage keys are visible via `keytar` introspection on most platforms, so hashing the URL component buys a real privacy delta.
- **(c) URL normalization.** Decide what counts as "the same server." Strawman: lowercase scheme + lowercase host + explicit port. Edge cases: `https://relay.lan` vs `https://relay.lan/`, `https://relay.lan:443` vs `https://relay.lan`, `https://Relay.LAN` vs `https://relay.lan`. Pick a normalization and apply it before the hash so equivalent URLs collapse to one stored credential.
- **(d) First-run flow under multi-server.** Decide how the "Relay: Connect to server" command behaves when the extension already has one or more paired servers. Strawman: always append a new `(url, token)` pair; never overwrite an existing one silently; if the user pastes a `relay://pair?url=…&token=…` for an already-paired URL, ask whether to replace the existing token (token rotation case) or cancel.
- **(e) Marker-driven binding.** Spec the per-root bind behavior under multi-server keys:
  - **Marker has `serverUrl` matching a paired server.** Bind silently using that server's credentials.
  - **Marker has `serverUrl` matching no paired server.** Surface "pair with this server" UX (single click — not the full "Connect to server" command — that lands the user on the pair prompt pre-filled with `marker.serverUrl`). Refuse to bind until paired. This preserves [[nd-07-marker-file-schema]] rule 5's refuse-to-bind-on-uncertainty principle.
  - **Marker omits `serverUrl`.** Bind using the IDE's default-paired server (the first one paired, or a `relay.defaultServer` SecretStorage key set on first-run). Surface a one-time notice when more than one server is paired and a marker omits `serverUrl` so the operator can decide whether to write the URL into the marker explicitly.
- **(f) Defaulting + migration.** Decide the migration path from the 6I single-server posture (`relay.serverUrl` + `relay.token`) to the resolved multi-server scheme. Strawman: on first activation under the new scheme, if the legacy keys exist, treat them as the singleton paired server and write the new per-server-URL keys; delete the legacy keys atomically. Decide whether to keep the legacy keys around in read-only mode for one release as a fallback.
- **(g) Token rotation.** Decide what happens when a paired server's token is rotated server-side (via `relay token revoke` + `relay token create`). The new token replaces the old one in SecretStorage for that server; the extension surfaces a "your token for `<serverUrl>` expired; re-pair" notice on the next 401. Confirm this is the right UX vs. silent re-pair via a stored refresh token (we have no refresh-token concept at MVP per D-13, so this is the path).
- **(h) ND-26..ND-29 interaction.** ND-26 (publish `@relay/protocol` to npm), ND-27 (freeze the WS endpoint as a third-party surface), ND-28 (programmatic m2m credential flow), and ND-29 (distribute `relay attach` standalone) all touch the multi-server-IDE story tangentially — a third-party client (the case ND-26..29 contemplate) might pair against multiple servers from a single host. Decide whether the SecretStorage scheme should anticipate "third-party clients use the same key shape" (so the future migration is just a doc note saying "use these key prefixes") or stay extension-specific. The architect's bias was extension-specific for Phase 1.
- **(i) Status-bar surface for multi-server.** The 6I status bar shows the persona + project for the focused root. Under multi-server, decide whether the status bar also surfaces which Relay server that root is bound to (e.g., `homelab/relay/main-worktree:agentic-dev`) or whether the server-URL stays implicit. The trade-off is one-glance disambiguation vs. status-bar real estate.

This is filed as `open` so the resolution lands as a deliberate decision rather than inline drift. ND-31 does not block 6I from shipping — the extension ships with single-server keys (`relay.serverUrl` + `relay.token`) and a refuse-to-bind-on-URL-mismatch fallback that preserves [[nd-07-marker-file-schema]] rule 5. Worth fast-following because any user who pairs a second server hits the refuse-to-bind path with no clear path forward except resetting SecretStorage manually.

## Resolution

*(unresolved)*
