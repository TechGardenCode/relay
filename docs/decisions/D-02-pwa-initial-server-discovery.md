---
id: D-02
status: deferred
title: "PWA initial server discovery"
deferred-until: "Phase 2 PWA work begins"
affects: "prd/05-mobile-pwa.md"
surfaced-by: "Original PRD §15 Q2"
---

# D-02 — PWA initial server discovery


**Status:** deferred (until Phase 2 PWA work begins)
**Affects:** `prd/05-mobile-pwa.md`
**Surfaced by:** Original PRD §15 Q2

## Question
How does the PWA discover the Relay server initially — hardcoded URL during pairing, or mDNS-style discovery on LAN?

## Current thinking
QR code at pairing time carries the URL. mDNS discovery deferred.

## Resolution
**Deferred** — the PWA is Phase 2 scope and this decision lands when that work begins.

**MVP behavior:** N/A — Phase 1 ships without a mobile PWA, so server discovery is not needed.

**Default direction when Phase 2 picks this up:** QR code at pairing time carries the URL. mDNS-style LAN discovery deferred further unless concrete user demand surfaces (e.g., setups where pairing must work without screen-to-screen QR transfer).

**Re-open trigger:** Phase 2 mobile PWA design doc begins.
