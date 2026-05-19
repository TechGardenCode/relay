# Relay — Threat Model

**Status:** v0.1 (Phase 1 MVP)
**Scope:** What a self-hosted, single-user Relay deployment is protecting, against whom, and what the user has to bring themselves. Orientation doc, not an audit artifact.

Relay's posture is committed in two PRD lines: **G-7** ("Network-local trust model at MVP. Bearer-token authentication. No public-internet hardening required by default; users provide their own tunnel if exposing externally", `prd/00-overview.md` §4) and **N-6** ("Not enterprise-ready at MVP. SSO, RBAC, audit logging, and multi-tenancy are designed for but not exposed", `prd/00-overview.md` §5). This doc spells out what that means in operational terms.

---

## 1. Assets

In rough order of blast radius if compromised:

- **Agent capability.** A running Relay server can spawn agent processes (Claude Code at MVP) that read and write any path the server process can reach. Compromising the bearer token is effectively "remote code execution as the user running `relay server`". This is the headline asset.
- **Model credentials.** Either an OAuth refresh token (the documented default per ND-19 — stored in the macOS Keychain or at `~/.claude/.credentials.json` on Linux, written by `claude login` on the host) or `ANTHROPIC_API_KEY` in the server's process environment (the documented fallback for headless deployments, per D-10). Both are propagated unchanged into every spawned agent via process credential / `$HOME` env inheritance. Never written to YAML or SQLite, but a compromised server process can read both its own env and its own home directory and spend either credential.
- **Transcripts.** Raw PTY bytes captured per session (D-07, `prd/03-server.md` §10). Whatever the user typed or the agent emitted — pasted secrets, source diffs, prompts — is persisted under `~/.relay/`.
- **Project source on disk.** Project working directories are registered in place (D-12, `prd/03-server.md` §3); the agent process inherits read/write to them.
- **Token store.** `~/.relay/tokens.json` holds hashed tokens, not plaintext (D-13). Compromising the file does not yield usable tokens, but replacing it would let an attacker inject a token whose hash they know.

## 2. Actors

- **The legitimate user, across N devices.** Multiple desktop installs (and a future mobile PWA) attaching to the same session (G-3, D-G3). Multi-client behavior is cooperative, not adversarial — the input-arbitration contract (D-G2, `prd/03-server.md` §5.1) explicitly assumes one user driving all devices.
- **Network-adjacent observer.** A peer on the same LAN, the same Tailscale tailnet, or the same shared homelab segment. Sees TCP frames if traffic is not TLS-wrapped.
- **Opportunistic remote attacker.** Relevant only if the user exposes Relay's port publicly without a tunnel. Port scanners, credential-bruteforcers, model-credit thieves. Default-deny by network shape, not by Relay code — there is no public-internet hardening at MVP (G-7).

Out of scope: the user themselves (a single-user system cannot defend against its operator), and malicious persona / skill / MCP content (the user authors their own personas and curates their own skills and MCP servers, per `prd/03-server.md` §3 and §8 — those are inputs the user controls, not adversarial inputs).

## 3. Trust boundaries

- **The server process is trusted.** It reads model credentials from its environment, owns the SQLite state file, owns `~/.relay/`, and spawns agent processes with its own OS privileges. The Relay process's privilege level is the blast radius — running it as root would be a self-inflicted wound.
- **The bearer token is the only secret.** 26-character Crockford-Base32, ≥128 bits of entropy, server-generated, shown plaintext exactly once at issue and hashed at rest (D-13, `prd/03-server.md` §6).
- **The wire is in the clear by default.** Bearer auth over plain HTTP/WS means a network-adjacent observer who can read packets reads the token in plaintext. TLS is the operator's responsibility, supplied by their tunnel choice (§6 below). Relay does not terminate TLS itself.
- **One credential set per server.** All sessions on a given Relay process share the same credentials — either the operator's OAuth state (Keychain on macOS, `~/.claude/.credentials.json` on Linux) or `ANTHROPIC_API_KEY` (D-10, ND-19). When both are present, Claude Code's resolver picks the env var, which silently bills against the API key rather than any active Claude.ai subscription. Operators who need credential isolation run separate Relay servers — there is no in-process isolation between "tenants" at MVP, even though the data-model seam exists for Phase 4 (`prd/03-server.md` §2).

## 4. Known mitigations (Phase 1)

- **Token entropy.** ≥128 bits, server-generated, shown once (D-13).
- **Tokens hashed at rest.** `~/.relay/tokens.json` contains salted SHA-256 hashes only (16-byte per-token random salt, `node:crypto`-native, no third-party deps); an attacker who reads the file does not recover usable tokens (D-13, [ND-09](open-questions.md#nd-09-bearer-token-hashing-algorithm)). A fast cryptographic hash is sufficient here because tokens carry ≥128 bits of entropy at issue — a slow memory-hard KDF defends low-entropy human credentials against offline brute-force, which is not the threat for high-entropy random secrets.
- **Immediate revocation.** `relay token revoke <id>` ends a token at once; in-flight WebSockets using it receive an `auth_expired` text frame followed by close code 4401 on the next message boundary (D-13 + `arch/ws-protocol.md` §`auth_expired`, §close-codes). No server restart required.
- **Pairing never traverses the network.** `relay init` prints the token on stdout and writes it to `~/.relay/last-pairing.txt` (D-13, `prd/03-server.md` §6). The user copies it into the IDE by hand or via the `relay://pair?…` deep link. There is no over-the-wire token-issue flow that an observer could intercept.
- **WS rejects invalid tokens before bytes flow.** The bearer is validated at HTTP `Upgrade` time; missing/invalid tokens fail with close 1008 before any session output is streamed (`arch/ws-protocol.md` §close-codes; `arch/rest-conventions.md` §401).
- **Project marker gitignored by default.** `relay project add` appends `.relay/project.json` to the project's `.gitignore` (D-G6, `prd/03-server.md` §7). The project ID does not leak into shared repos.
- **Server restart kills orphaned sessions.** No zombie agent processes survive a restart; rows transition to `killed` with `terminated_reason = "server_restart"` and are not auto-relaunched (D-11, `prd/03-server.md` §3). Operators notice the gap rather than inherit dangling processes.
- **Credentials never persisted by Relay.** Model credentials live only in the operator's existing storage — Claude Code's OAuth state in the macOS Keychain or at `~/.claude/.credentials.json` on Linux (the default per ND-19), or `ANTHROPIC_API_KEY` in the server's process env (the fallback per D-10). Relay never reads, copies, or writes either. The channel by which the spawned agent sees them is process credential / `$HOME` inheritance for OAuth and `process.env` inheritance for the env var. A stolen state-DB or persona YAML does not yield either credential.

## 5. Known deferrals

Things the PRD has explicitly decided *not* to do at MVP, with the trigger that re-opens each:

- **Per-device token rotation** — Phase 3 (D-05). MVP tokens are valid until revoked.
- **Per-tenant / per-persona credential isolation** — Phase 3+ (D-10 re-evaluation trigger). MVP shares one credential set per server; operators isolate by running separate Relay processes.
- **Credential-precedence arbitration.** If both `ANTHROPIC_API_KEY` and `claude login` OAuth state are present, Claude Code prefers the env var (upstream behavior). Relay does not detect or warn on this configuration. Operators who run `claude login` should ensure `ANTHROPIC_API_KEY` is unset in the shell that launches `relay server` if they want subscription billing rather than pay-per-token API billing. (ND-19.)
- **RBAC.** Phase 4. REST conventions reserve `403 Forbidden` for it (`arch/rest-conventions.md` §status-codes) but Relay does not emit 403 at MVP.
- **Audit logging.** Phase 4 (N-6). Transcripts are the only record of session activity at MVP; there is no separate auth/admin audit stream.
- **SSO / OIDC.** Phase 4 (N-6). Bearer tokens are the entire auth surface.
- **Multi-tenant runtime enforcement.** Phase 4. The data-model seam exists for forward-compat (`prd/03-server.md` §2: tenant routes are internal at MVP) but no isolation is enforced between rows.
- **Public-internet hardening.** Rate limiting, CORS posture, brute-force lockouts — none in MVP scope (G-7; `arch/rest-conventions.md` "out of scope").

## 6. User-facing guidance — choosing a network shape

**Decision tree:** same machine → nothing. Same trusted network → Tailscale. Reachable from the internet → Caddy + TLS in front. Anything else, walk back.

- **Localhost only.** Both clients on the same machine (e.g., terminal + VS Code on the same laptop). No tunnel, no TLS. Default posture for `npm install -g @relay/relay` developer use. Bearer auth alone is sufficient because the wire never leaves the host.
- **Tailscale (or WireGuard) tailnet.** All devices are tailnet peers. Bearer auth runs over the private mesh; the tailnet provides identity-based admission *and* transport encryption. This is the recommended cross-device posture for homelab use: no public exposure, no manual cert management, no DNS gymnastics. The `docker-compose` reference deployment in `prd/06-distribution.md` ships a Tailscale sidecar for exactly this case.
- **Public exposure behind Caddy + TLS.** Caddy fronts Relay with an automatic Let's Encrypt cert; bearer auth still gates access but is now wrapped in TLS, so a network-adjacent observer no longer sees the token. Use this when the user genuinely needs internet-reachable access and Tailscale isn't an option. Pair with a strong revocation discipline (`relay token revoke` whenever a device is lost) since rotation is deferred (D-05).
- **Not recommended: public exposure with no tunnel and no TLS.** Bearer token in the clear over the internet, no rate limiting, no audit, no lockout. The Anthropic credit behind the process is spendable by anyone who captures one request. Don't ship this configuration.

---

This is the Phase 1 posture. As Phase 3 and Phase 4 land (rotation, RBAC, audit, per-tenant credentials), this doc gets the updates — not the PRD subdocs, which describe what is built, not what the user has to wrap around it.
