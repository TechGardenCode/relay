# Relay PRD — Overview

**Status:** v0.4
**Scope:** What Relay is, the burning pains it solves, how it differentiates, and what's in vs. out of scope. Read this before any other subdoc.

---

## 1. What Relay is

Relay is a lightweight orchestration service that makes AI-assisted coding sessions portable, persistent, and structured. It owns the lifecycle of CLI-based AI coding agents (Claude Code at MVP), exposes them to multiple client surfaces (an IDE extension on desktop, a PWA on mobile), and adds a structured project + persona context model on top of the agents' native configuration.

Relay does not replace editors or agents. It is the glue between them: a server that holds long-running agent sessions and the context they execute in, accessible from whatever device is convenient.

## 2. Headline value proposition

Relay addresses two co-equal burning pains that share one architectural solution.

### Pain A — Cross-device discontinuity

Today, a developer using a CLI coding agent is bound to the machine that started the session. Closing the laptop ends meaningful continuation. Existing workarounds — Tailscale + `tmux` + `ssh`, or Anthropic Remote Control with the laptop running — are partial: they require the original machine online, support one session, and have no project/role abstraction. The friction is real, recurring, and unaddressed by any general-purpose product.

### Pain B — Context-switching cost across concurrent sessions

A developer managing multiple simultaneous coding-agent sessions across projects and roles (architecture review, implementation, testing, infra) spends real time hand-editing `CLAUDE.md`, `.mcp.json`, and skill folders to swap mental modes — and tracking which terminal holds which context. There is no UX today for switching between structured roles inside an agent.

### One backbone, two pains

These pains are not in tension. They share an architectural solution: **server-owned sessions with a structured project/persona model on top**. The same backbone — sessions persisted off the client, addressable by structured identity rather than terminal window — enables both.

## 3. Defensible differentiation

Relay's wedge is the combination of three properties, none of which any single competitor delivers together:

1. **Fully composable persona × project model.** First-class structured context switching, not config-file gymnastics. No competitor leads with this.
2. **Deployment-shape agnostic.** The same binary scales from `npm install` on a laptop, to a homelab Docker container, to on-prem, to (eventually) cloud-native/SaaS. No competitor in the space spans all four shapes from the same build.
3. **Agent-and-editor-agnostic infrastructure.** Relay does not replace the client; it backs whatever client the user already has (Cursor, VS Code, terminal, future mobile PWA). The product is leaner because it focuses on the orchestration gap between existing best-in-class tools rather than re-bundling a stack.

## 4. Goals

- **G-1.** Long-running agent sessions hosted on a server, surviving any single client's disconnection.
- **G-2.** First-class project, persona, and session entities with explicit lifecycle management.
- **G-3.** Concurrent multi-client attach to a single session. Desktop and mobile see the same live state.
- **G-4.** Preserve and reuse the agent CLI's native configuration on disk. No duplication, no shadowing.
- **G-5.** Zero-modification compatibility with VS Code, Cursor, and other VS Code API–compatible editors at Phase 1.
- **G-6.** Deploy as a single npm install or Docker container with sensible defaults.
- **G-7.** Network-local trust model at MVP. Bearer-token authentication. No public-internet hardening required by default; users provide their own tunnel if exposing externally.

## 5. Non-goals

- **N-1.** Not an editor. No code rendering, autocomplete, LSP, or inline AI on either surface.
- **N-2.** Not an agent. No direct LLM API integration; agent CLIs are spawned as subprocesses.
- **N-3.** Not a code-server fork or browser IDE. Desktop coding remains in the user's existing editor.
- **N-4.** Not a mobile coding tool. The mobile client is for monitoring, prompting, and approving — not editing.
- **N-5.** Not a SaaS at MVP. Self-host only at MVP; SaaS deployment shape may emerge later given the deployment-shape-agnostic architecture, but is explicitly out of scope for Phase 1–3.
- **N-6.** Not enterprise-ready at MVP. SSO, RBAC, audit logging, and multi-tenancy are designed for but not exposed.
- **N-7.** Not a plugin ecosystem. Personas, skills, and MCP cover the extension story.
