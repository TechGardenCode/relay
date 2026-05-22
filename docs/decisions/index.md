# Decision index

Every resolved, deferred, or open Relay decision lives in its own file under `docs/decisions/`. This index lists them all so the [`prd-link`](../../.claude/skills/prd-link/SKILL.md) and [`decision-log`](../../.claude/skills/decision-log/SKILL.md) skills can find a decision by ID without reading the full log.

See [`protocol.md`](protocol.md) for the per-decision file template and the 5-step propagation protocol.

**Counts.** Resolved: 33 · Open: 17 · Deferred: 3.

## Open / in-deliberation

- [`ND-08` — Skill subset enforcement mechanism](ND-08-skill-subset-enforcement-mechanism.md)
- [`ND-10` — `relay token list` subcommand surface alignment](ND-10-relay-token-list-subcommand-surface-alignment.md)
- [`ND-15` — `relay session show` subcommand surface alignment](ND-15-relay-session-show-subcommand-surface-alignment.md)
- [`ND-16` — CLI ↔ data-plane boundary rule](ND-16-cli-data-plane-boundary-rule.md)
- [`ND-17` — `relay attach` raw-mode TTY variant of the §5.1 client FSM](ND-17-relay-attach-raw-mode-tty-variant-of-the-5-1-client-fsm.md)
- [`ND-18` — Lazy-load CLI dispatcher contract](ND-18-lazy-load-cli-dispatcher-contract.md)
- [`ND-25` — `relay attach` detach with `^D` requires two keypresses on the host TTY](ND-25-relay-attach-detach-with-d-requires-two-keypresses-on-the-host-tty.md)
- [`ND-26` — Publish `@relay/protocol` package to npm as a third-party surface](ND-26-publish-relay-protocol-package-to-npm-as-a-third-party-surface.md)
- [`ND-27` — Stability commitment for the WS endpoint as a third-party surface](ND-27-stability-commitment-for-the-ws-endpoint-as-a-third-party-surface.md)
- [`ND-28` — Programmatic / machine-to-machine credential flow](ND-28-programmatic-machine-to-machine-credential-flow.md)
- [`ND-29` — Distribute `relay attach` as a standalone package](ND-29-distribute-relay-attach-as-a-standalone-package.md)
- [`ND-30` — `relay attach` stderr event-stream protocol for subprocess-of-attach consumers](ND-30-relay-attach-stderr-event-stream-for-subprocess-of-attach-consumers.md)
- [`ND-31` — SecretStorage key namespace for multi-server IDE pairing](ND-31-secretstorage-key-namespace-for-multi-server-ide-pairing.md)
- [`ND-32` — Install + onboarding deep-dive — painless-rollout bar](ND-32-install-and-onboarding-deep-dive.md)
- [`ND-33` — IDE GUI overhaul deep-dive — painless-rollout bar](ND-33-ide-gui-overhaul-deep-dive.md)
- [`ND-34` — Session + attach polish deep-dive — painless-rollout bar](ND-34-session-and-attach-polish-deep-dive.md)
- [`ND-35` — Diagnostics + error UX deep-dive — painless-rollout bar](ND-35-diagnostics-and-error-ux-deep-dive.md)

## Deferred

- [`D-02` — PWA initial server discovery](D-02-pwa-initial-server-discovery.md) _(deferred: Phase 2 PWA work begins)_
- [`D-05` — Per-device token rotation](D-05-per-device-token-rotation.md) _(deferred: Phase 3 hardening)_
- [`D-14` — Product name](D-14-product-name.md) _(deferred: pre-launch naming review)_

## Resolved

_Newest first._

- [`ND-36` — Subprotocol-sourced bearer token for browser-WS auth](ND-36-subprotocol-sourced-bearer-token-for-browser-ws-auth.md) _(2026-05-22)_
- [`D-15` — UX rollout posture](D-15-ux-rollout-posture.md) _(2026-05-22)_
- [`ND-24` — Per-keystroke input streaming for TUI agents](ND-24-per-keystroke-input-streaming-for-tui-agents.md) _(2026-05-19)_
- [`ND-23` — PTY size negotiation and SIGWINCH forwarding for attach clients](ND-23-pty-size-negotiation-and-sigwinch-forwarding-for-attach-clients.md) _(2026-05-18)_
- [`ND-19` — `claude login` OAuth as the documented credential default; `ANTHROPIC_API_KEY` as fallback](ND-19-claude-login-oauth-as-the-documented-credential-default-anthropic-api-key-as-fallback.md) _(2026-05-18)_
- [`ND-22` — `vm-e2e` test-home symlink set is platform-specific (macOS needs `Library/` for Keychain)](ND-22-vm-e2e-test-home-symlink-set-is-platform-specific-macos-needs-library-for-keychain.md) _(2026-05-18)_
- [`ND-09` — Bearer token hashing algorithm](ND-09-bearer-token-hashing-algorithm.md) _(2026-05-17)_
- [`ND-11` — `agentSessionId` capture mechanism](ND-11-agentsessionid-capture-mechanism.md) _(2026-05-17)_
- [`ND-12` — `spawn.json` schema location](ND-12-spawn-json-schema-location.md) _(2026-05-17)_
- [`ND-13` — Byte-accounting cadence for `sessions.total_bytes`](ND-13-byte-accounting-cadence-for-sessions-total-bytes.md) _(2026-05-17)_
- [`ND-14` — Transcript response field naming (camelCase)](ND-14-transcript-response-field-naming-camelcase.md) _(2026-05-17)_
- [`D-09` — Persona YAML schema](D-09-persona-yaml-schema.md) _(2026-05-15)_
- [`D-10` — Agent model credentials handling](D-10-agent-model-credentials-handling.md) _(2026-05-15)_
- [`D-11` — Server restart and session orphaning](D-11-server-restart-and-session-orphaning.md) _(2026-05-15)_
- [`D-12` — Project record storage and `relay project add` semantics](D-12-project-record-storage-and-relay-project-add-semantics.md) _(2026-05-15)_
- [`D-13` — First-run pairing UX](D-13-first-run-pairing-ux.md) _(2026-05-15)_
- [`ND-01` — Claim-lock timeout duration](ND-01-claim-lock-timeout-duration.md) _(2026-05-15)_
- [`ND-02` — Rejection UX for BUSY response](ND-02-rejection-ux-for-busy-response.md) _(2026-05-15)_
- [`ND-03` — Ring buffer size for attach replay](ND-03-ring-buffer-size-for-attach-replay.md) _(2026-05-15)_
- [`ND-04` — Transcript pagination API shape](ND-04-transcript-pagination-api-shape.md) _(2026-05-15)_
- [`ND-05` — Multi-root workspace marker file precedence](ND-05-multi-root-workspace-marker-file-precedence.md) _(2026-05-15)_
- [`ND-06` — Worktree project identity](ND-06-worktree-project-identity.md) _(2026-05-15)_
- [`ND-07` — Marker file schema](ND-07-marker-file-schema.md) _(2026-05-15)_
- [`D-G1` — Persona application semantics](D-G1-persona-application-semantics.md) _(2026-05-14)_
- [`D-G2` — Multi-client input arbitration](D-G2-multi-client-input-arbitration.md) _(2026-05-14)_
- [`D-G3` — Reattach semantics](D-G3-reattach-semantics.md) _(2026-05-14)_
- [`D-G6` — Project discovery / workspace-to-project binding](D-G6-project-discovery-workspace-to-project-binding.md) _(2026-05-14)_
- [`D-01` — Workspace root vs. subdirectory for start-session](D-01-workspace-root-vs-subdirectory-for-start-session.md) _(2026-05-14)_
- [`D-03` — MCP set changes mid-session](D-03-mcp-set-changes-mid-session.md) _(2026-05-14)_
- [`D-04` — Transcript export endpoint](D-04-transcript-export-endpoint.md) _(2026-05-14)_
- [`D-06` — Persona inheritance](D-06-persona-inheritance.md) _(2026-05-14)_
- [`D-07` — Transcript stream capture layer](D-07-transcript-stream-capture-layer.md) _(2026-05-14)_
- [`D-08` — Single binary vs. separate packages](D-08-single-binary-vs-separate-packages.md) _(2026-05-14)_
