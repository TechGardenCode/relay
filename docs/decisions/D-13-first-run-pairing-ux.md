---
id: D-13
status: resolved
title: "First-run pairing UX"
resolved-on: 2026-05-15
affects: "prd/03-server.md §6, prd/04-ide-extension.md §4"
surfaced-by: "Doc audit (2026-05-15)"
---

# D-13 — First-run pairing UX


**Status:** resolved (2026-05-15)
**Affects:** `prd/03-server.md` §6, `prd/04-ide-extension.md` §4
**Surfaced by:** Doc audit (2026-05-15)

## Question
How does the device-pairing flow work end-to-end between `relay init` on the server and the IDE extension's first-run prompt? `03-server.md` §6 commits to bearer-token-via-out-of-band but the user-visible UX has not been spelled out.

## Context
The first-run experience for every Relay user begins with this flow. If a developer cannot get past "I started the server, now what?" within a minute, the product fails its self-host posture. The mobile PWA's QR-code pairing builds on the same primitive but is Phase 2 scope.

## Resolution
**`relay init` emits a single copy-paste snippet on stdout; the IDE extension first-run prompt accepts that snippet whole or its constituent parts; tokens are long-lived and reusable until revoked.**

1. **`relay init` output.** After generating config and the initial token, `relay init` prints (and writes to `~/.relay/last-pairing.txt`) a snippet of the form:
   ```
   Relay is ready. Pair your IDE extension by pasting this:
       relay://pair?url=https://relay.homelab.lan&token=01HXYZ...
   Or by URL + token separately:
       Server URL: https://relay.homelab.lan
       Token:      01HXYZ...
   ```
   The `relay://pair?...` URL is a single-token-payload deep link; the URL and token printed separately are the same values in unstructured form for users who can't use the deep link.
2. **IDE extension first-run.** The extension command-palette entry "Relay: Connect to server" presents a single text input. The user pastes either the `relay://pair?...` URL or pastes the URL and token in two separate fields (toggle in the prompt). The extension validates by issuing an authenticated probe (e.g., `GET /tenants/self`) and on success stores the values in VS Code secret storage.
3. **No server-side confirmation step.** The first authenticated use of a token is the pairing handshake — there is no "approve this device" prompt on the server. The tradeoff is intentional: this is single-user self-host, the token is the only secret, and a "confirm pairing" step adds a coordination round trip that has no security value here (the user holds both ends).
4. **Tokens are long-lived and reusable.** A token issued by `relay init` is valid indefinitely until `relay token revoke` runs (see [[d-05-per-device-token-rotation]] for the long-term rotation story, deferred to Phase 3). The same token can pair multiple devices; operators who want per-device tokens use `relay token create --device <name>` to issue distinct tokens before pairing each device.
5. **Format and entropy.** Tokens are 26-character Crockford-Base32 strings carrying ≥128 bits of entropy. They are stored hashed in `~/.relay/tokens.json` and the plaintext is shown to the operator exactly once (at issue time).
6. **Mobile PWA reuse.** The Phase 2 mobile QR code encodes the same `relay://pair?...` URL. Phase 1 ships only the desktop flow; mobile pairing arrives with the PWA work.

**Why no server-side approval step:** A self-hosted single-user posture is exactly the case where "approve this device" is friction with no security value. If the token leaks, the right answer is `relay token revoke`, not a manual approval gate that the user would always click "yes" on anyway. This is restated in the auth section ([[d-05-per-device-token-rotation]]'s deferral).

**Why the `relay://pair?...` URL and the plain text both:** Some terminals don't honor URL handlers; some IDEs strip query strings on paste. Offering both forms means a one-paste path when the deep link works and a fallback that always works.

**Propagated to:** `prd/03-server.md` §6 (2026-05-15), `prd/04-ide-extension.md` §4 (2026-05-15).
