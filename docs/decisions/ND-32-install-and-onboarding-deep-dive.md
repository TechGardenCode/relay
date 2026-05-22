---
id: ND-32
status: open
title: "Install + onboarding deep-dive — painless-rollout bar"
affects: "docs/prd/06-distribution.md (the install / distribution narrative); docs/prd/03-server.md §6 (`relay init` + pairing flow); packages/extension/ packaging shape (Marketplace publication, sideload story, `relay` binary discovery); the operator's first-run path from `claude login` through paired-IDE to first session."
surfaced-by: "[[d-15-ux-rollout-posture]] resolution (2026-05-22). One of four per-surface deep-dives opened to gate Phase 1.5 rollout."
---

# ND-32 — Install + onboarding deep-dive — painless-rollout bar

**Status:** open
**Affects:** `docs/prd/06-distribution.md` (the install / distribution narrative); `docs/prd/03-server.md` §6 (`relay init` + pairing flow); `packages/extension/` packaging shape (Marketplace publication, sideload story, `relay` binary discovery); the operator's first-run path from `claude login` through paired-IDE to first session.
**Surfaced by:** [[d-15-ux-rollout-posture]] resolution (2026-05-22). One of four per-surface deep-dives opened to gate Phase 1.5 rollout.

## Question
What is the minimum painless-rollout bar for **install and onboarding** — the path a brand-new user walks from "I have nothing" to "I'm typing into a Claude session through my IDE"? Today the path is end-to-end manual (sideload, global-link, pre-auth, hand-paste). Which of those steps must become hands-off, automated, or at least guided before Relay can be installed by someone who is not the author?

## Elaboration prompt
The inventory in [`docs/arch/ux-rollout-posture.md`](../arch/ux-rollout-posture.md) §3 lists what's painful today. The resolution must decide which items are P0 (must ship before rollout), which are P1 (ship if cheap), and which are explicitly deferred with a rationale. The triage frame below covers the known surface; the resolution may add items the deep-dive surfaces.

**What to consider:**

- **(a) Marketplace publication for the `.vsix`.** The extension is sideload-only today (`pnpm -F relay-extension vsix` → `code --install-extension`). For non-author users, sideload is a blocker — they want to install from the VS Code / Cursor / Open VSX marketplace. Decide: VS Code Marketplace (Microsoft account, MSFT publisher review), Open VSX (Eclipse Foundation, faster), or both. Ties to build-plan `6J` distribution scope. Confirm whether the existing `vsce`-built `.vsix` artifact is marketplace-ready or needs metadata additions (publisher, icon, repository, README rendering).

- **(b) `relay` binary discovery from the extension.** The extension spawns `vscode.window.createTerminal({ shellPath: 'relay', shellArgs: ['attach', sid, ...] })` (see `packages/extension/src/commands/`), which requires `relay` on the user's PATH. Today that means `npm link` during development; post-6J it means a successful `npm install -g @relay/relay`. Decide: does the extension probe for `relay` on activation and surface a "binary not found, here's how to install" guidance, or does it assume PATH and fail loudly? What about users on Cursor over Remote-SSH where the local PATH and remote PATH differ?

- **(c) `claude login` pre-flight gate.** Per [[nd-19-claude-login-oauth-as-the-documented-credential-default-anthropic-api-key-as-fallback]], OAuth-via-`claude login` is the documented credential default. Today the operator must know to run it before `relay server` boots, and there is no surfaced affordance from `relay init` or the IDE extension reminding them. Decide: does `relay init` check for credentials and prompt the user to run `claude login`? Does `relay server` fail-fast with a helpful error if credentials are missing? Does the IDE extension surface "no credentials configured on server" when it attempts to start a session? This overlaps [[nd-35-diagnostics-and-error-ux-deep-dive]] (the credential-validation diagnostic), but the *onboarding narrative* belongs here.

- **(d) `relay init` narrative bridge.** D-13 commits to the pairing URL output, but `relay init` ends with the snippet on stdout and leaves the operator to figure out the next steps ("run `relay server`", "open this URL in your IDE", "now create your first project"). Decide whether `relay init` prints a numbered next-steps block, links to a `docs/getting-started.md`, or both. Consider whether `relay init` should optionally launch `relay server` for the operator (with `--start`).

- **(e) `relay attach` distribution as a standalone artifact.** The current shape bundles `relay attach` inside `@relay/relay` — the IDE extension shells out to the same binary. Was filed in Phase 0 audit but no ND exists yet. Decide whether `relay attach` ships as its own tiny package (`@relay/attach`) so third-party tools (MCP wrappers, terminal multiplexers, future extensions) can depend on a narrow surface, or whether the single-binary posture from D-08 holds. The arch doc surfaces this under ND-32; either resolve here or open a new ND-NN sibling.

- **(f) Cross-device install assumptions.** The 6I walk used remote SSH (workstation IDE → SSH-tunnelled server). Decide whether the install story documents "server on home Mac, IDE on work laptop" as a first-class scenario (with a guide for SSH tunnel / Tailscale / Caddy + reverse proxy) or whether Phase 1.5 ships with same-machine install assumed and cross-device deferred.

- **(g) Update / version-check UX.** No version banner anywhere — extension version, server version, `relay` binary version are not surfaced. Decide whether `relay init` + the extension status bar surface versions, and whether the extension warns when the server and extension versions diverge across a major bump.

- **(h) First-run telemetry / failure-reporting opt-in.** Out of scope for this ND unless the resolution decides otherwise; flag here so the deep-dive consciously punts (or scopes in).

**Validation against the gate.** The resolution must end with a line of the shape "the painless-rollout bar for install + onboarding is: <one-paragraph statement>" so [[d-15-ux-rollout-posture]] §7 can quote it. The bar may be "all of the above" or "marketplace publication + binary discovery + credential pre-flight; defer (d), (f), (g) with rationale."

This is filed as `open` so the resolution lands as a deliberate deep-dive (Track 7B in `docs/build-plan.md`) rather than inline drift.

## Resolution

*(unresolved)*
