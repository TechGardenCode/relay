---
id: ND-02
status: resolved
title: "Rejection UX for BUSY response"
resolved-on: 2026-05-15
affects: "prd/04-ide-extension.md, prd/05-mobile-pwa.md"
surfaced-by: "[[d-g2-multi-client-input-arbitration]] resolution"
---

# ND-02 — Rejection UX for BUSY response


**Status:** resolved (2026-05-15)
**Affects:** `prd/04-ide-extension.md`, `prd/05-mobile-pwa.md`
**Surfaced by:** [[d-g2-multi-client-input-arbitration]] resolution

## Question
When a client's `CLAIM` is rejected with `BUSY`, what does the user see? The D-G2 resolution requires the losing client's draft to be preserved and a brief notice to be shown, but the exact rendering and retry behavior is unspecified.

## Resolution
**A one-shot, dismissible notice anchored near the input; no auto-retry; local buffer preserved.** Both client surfaces follow the same contract; only the visual primitive differs.

1. **Anchoring.** The notice appears adjacent to the input area (status-bar-row in the IDE terminal widget; inline above the compose field in the PWA). It does not appear as a global toast that obscures session output.
2. **Wording.** "Another device is interacting with this session." Short, low-alarm, no jargon ("CLAIM", "BUSY", "lock").
3. **Lifecycle.** The notice dismisses automatically after 4 seconds, or immediately when the user starts typing again or hits Enter again — whichever comes first.
4. **No auto-retry.** The client does not silently re-attempt the claim. The user retries by pressing Enter; the rejected message is still in their local input buffer untouched, so retry is a single keystroke.
5. **No queueing.** A rejected message is not held server-side and re-sent when the other claim releases. The user owns the retry decision; the server is stateless between messages per [[d-g2-multi-client-input-arbitration]].

**Why no auto-retry:** Auto-retry from the rejected client races with the other device's input cadence — the same user could end up sending a stale prompt seconds after they've already moved on with the other device. A manual retry keeps the user's intent explicit.

**Propagated to:** `prd/03-server.md` §5.1 (2026-05-15), `prd/04-ide-extension.md` §4 (2026-05-15), `prd/05-mobile-pwa.md` §3a (2026-05-15).
