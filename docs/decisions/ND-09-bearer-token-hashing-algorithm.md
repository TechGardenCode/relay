---
id: ND-09
status: resolved
title: "Bearer token hashing algorithm"
resolved-on: 2026-05-17
affects: "prd/03-server.md §6, docs/threat-model.md §4"
surfaced-by: "build-plan 6B preflight (2026-05-17) — auth/hash.ts needs a concrete algorithm before it can be written."
---

# ND-09 — Bearer token hashing algorithm


**Status:** resolved (2026-05-17)
**Affects:** `prd/03-server.md` §6, `docs/threat-model.md` §4
**Surfaced by:** build-plan 6B preflight (2026-05-17) — `auth/hash.ts` needs a concrete algorithm before it can be written.

## Question
What algorithm does the `auth/` module use to hash bearer tokens at rest in `~/.relay/tokens.json`? [[d-13-first-run-pairing-ux]] commits to "hashed at rest" and `docs/threat-model.md` §4 restates it, but neither names the algorithm or salt scheme.

## Context
Tokens are 26-character Crockford-Base32 strings carrying ≥128 bits of cryptographically random entropy ([[d-13-first-run-pairing-ux]] §5). The hash exists to protect against a single failure mode: an attacker who reads `~/.relay/tokens.json` (e.g., via a backup leak, a stolen laptop, an over-permissive file mode) but who does not have the plaintext. With ≥128 bits of entropy in the input, the attacker cannot brute-force the preimage — a slow memory-hard KDF (`argon2id`, `scrypt`) earns nothing they wouldn't already be defended against by a fast cryptographic hash. Slow KDFs exist to defend low-entropy human-chosen passwords against offline grinding; that is not this threat.

The choice has real implementation cost. `argon2` and `bcrypt` are native dependencies that need a C toolchain on every install target (macOS, Linux, the Docker base image). Node's built-in `node:crypto` `createHash('sha256')` is part of the runtime, has no install footprint, and is the same primitive used to validate the token on every authenticated request — so the verification hot path stays microseconds, not milliseconds.

## Options under consideration
- **Option A — SHA-256 + 16-byte per-token random salt.** Each token row stores `{ saltB64, hashB64 }`; on verify, recompute `sha256(salt || plaintext)` and constant-time-compare. Zero native deps, fast on the verify path, cryptographically sufficient for ≥128-bit input. Salt prevents identical-token collisions across rows and across server installs.
- **Option B — `scrypt` via `node:crypto.scryptSync`.** Built-in (no native dep), memory-hard. Adds ~100 ms per verify call by default tuning — material on the WS upgrade path where verification gates every connection. Earns no security against the high-entropy threat model here.
- **Option C — `argon2id` via the `argon2` package.** Industry default for password hashing. Native compile required (binding.gyp); installation friction on every target. Same "no security gain over Option A for high-entropy input" trade.

## Resolution
**Option A: SHA-256 with a 16-byte per-token random salt, stored as `{ saltB64, hashB64 }` columns on the token record.** Verification rehashes `sha256(saltBytes || utf8(plaintext))` and constant-time-compares (`crypto.timingSafeEqual`) against the stored hash.

1. **Salt generation.** Each token gets a fresh 16-byte salt from `crypto.randomBytes(16)` at issue time. Salt is stored base64-encoded on the same record as the hash.
2. **Hash function.** `crypto.createHash('sha256').update(saltBytes).update(plaintext).digest()` → base64-encode → stored as `hashB64`. The hash is a fixed 32 bytes (43 base64 chars unpadded).
3. **Verify path.** `auth/verify(plaintext)` walks the active (non-revoked) token records, recomputes the salted hash per record, and `timingSafeEqual`s against the stored hash. Linear in active-token count, but bounded — operators typically hold <10 active tokens.
4. **No algorithm tag on records.** The token record schema does not carry an `algorithm: 'sha256-v1'` field at MVP. If a future migration changes the algorithm, the schema gains the field and the migration writes it on read.
5. **Implementation.** `auth/hash.ts` exposes two functions: `hashToken(plaintext) → { saltB64, hashB64 }` and `verifyTokenHash(plaintext, saltB64, hashB64) → boolean`. Both wrap `node:crypto` directly; no third-party dep.

**Why this and not Option B/C (`scrypt`, `argon2id`):** Slow memory-hard KDFs are the right answer for low-entropy human-chosen passwords because they raise the per-guess cost of an offline brute-force. With ≥128 bits of entropy in the input, the offline brute-force is already infeasible by the input space alone — adding KDF cost protects against a threat that doesn't exist here. The verification hot path runs on every authenticated REST call and every WS upgrade; a 100ms `scrypt` per request would be material. `argon2` additionally adds a native compile dependency to every install target, which conflicts with the "npm install runs cleanly on any Node 22 host" posture in `prd/06-distribution.md`.

**Why a per-token salt at all, given ≥128-bit input:** Salt is cheap (16 bytes per record) and defends two narrow but real scenarios — (1) two distinct Relay installs that, by astronomical chance, both issue the same plaintext token still produce different stored hashes, and (2) the hash output cannot be precomputed against a rainbow table of well-known token values (the table is empty today, but the discipline is free).

**Re-open trigger:** A future threat-model change that introduces low-entropy or human-chosen credentials (e.g., a Phase 4 admin password); or a token-format change that drops below 128 bits of entropy. Neither is on the roadmap.

**Propagated to:** `prd/03-server.md` §6 (2026-05-17), `docs/threat-model.md` §4 (2026-05-17).
