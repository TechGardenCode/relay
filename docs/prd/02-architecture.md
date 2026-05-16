# Relay PRD — Architecture

**Status:** v0.4
**Scope:** System-level diagram, deployment shapes, and the architectural backbone. Detailed component specs live in `03-server.md`, `04-ide-extension.md`, and `05-mobile-pwa.md`. Read `01-conceptual-model.md` first.

---

## System diagram

```
┌──────────────────────────────────────────────────────────────────┐
│ CLIENT SURFACES                                                  │
│                                                                  │
│  ┌──────────────────────────┐    ┌─────────────────────────────┐ │
│  │ Desktop                  │    │ Mobile (PWA, Phase 2)       │ │
│  │ VS Code / Cursor with    │    │ - active sessions list      │ │
│  │ Relay extension          │    │ - session live view         │ │
│  │                          │    │ - text input (device voice  │ │
│  │ Terminal in editor       │    │   dictation works natively) │ │
│  │ = thin attach to a       │    │ - file viewer w/ markdown   │ │
│  │   server-owned PTY       │    │ - diff approval             │ │
│  └─────────┬────────────────┘    └──────────────┬──────────────┘ │
│            │ WebSocket (PTY proxy)              │ WebSocket + REST│
└────────────┼────────────────────────────────────┼─────────────────┘
             │                                    │
┌────────────┴────────────────────────────────────┴─────────────────┐
│ RELAY SERVER                                                      │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │ Node.js service (single binary via npm or Docker image)  │     │
│  │  - REST API: tenants, projects, personas, sessions       │     │
│  │  - WebSocket: bidirectional PTY I/O streaming            │     │
│  │  - Bearer-token auth (per-device tokens)                 │     │
│  │  - SQLite for state                                      │     │
│  └────────────────┬─────────────────────────────────────────┘     │
│                   │                                               │
│   node-pty spawn  │                                               │
│                   ▼                                               │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │ Agent processes (Claude Code at MVP)                     │     │
│  │   One PTY per session, server-owned                      │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │ Filesystem                                               │     │
│  │   <project path>/                    registered in place │     │
│  │   ~/.claude/                         Claude Code native  │     │
│  │   ~/.relay/                          Relay metadata      │     │
│  └──────────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────────┘
```

## Architectural backbone: server owns all PTYs

When the user invokes "Start session" from any client, the server spawns the agent CLI under `node-pty` and registers a Session. All clients — IDE terminal, mobile PWA, anything else — are thin attach surfaces that stream PTY I/O over WebSocket. The agent process never lives on a client device. Disconnections are non-events; reattachment is instant.

The behavioral contracts that make multi-client attach safe and predictable are defined in `03-server.md`. Input arbitration is a **per-message claim lock** (`CLAIM → SEND → RELEASE` over WebSocket, with `BUSY` on contention) rather than a long-lived "control holder" token: the server stays stateless between messages, and the model assumes a single user spanning their own devices instead of adversarial collaborators. Reattach semantics prioritize the live stream: every attaching client begins receiving current PTY output immediately, with a short replay of recent bytes for context; deeper history is pulled on demand from the paginated transcript endpoint, so server-side behavior does not branch by client surface.

*Input arbitration resolved by [D-G2](../open-questions.md#d-g2-multi-client-input-arbitration) on 2026-05-14. Reattach semantics resolved by [D-G3](../open-questions.md#d-g3-reattach-semantics) on 2026-05-14.*

## Two deployment shapes, same binary

- **Local mode.** Server runs on the developer's primary machine (laptop or desktop). Other devices reach it over LAN, Tailscale, or a tunnel.
- **Remote mode.** Server runs on dedicated infrastructure (homelab VM, VPS, k8s pod). All clients including the primary machine connect over the network. This is the deployment that survives "I left my laptop at home" scenarios.

Choice is configuration, not different code paths. Deployment-shape agnosticism is one of Relay's three defensible differentiators (see `00-overview.md`).
