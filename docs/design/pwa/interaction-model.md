# Relay PWA — interaction model

Information architecture, the live-session screen, and the spawn / scratch flows. Governed by
[`D-18`](../../decisions/D-18-pwa-terminal-substrate-and-mvp-scope.md).

---

## 1. Information architecture

```
Sessions (home)
├─ Projects ──────────────┐  grouped list; per-project session count + status
│   └─ <project>          │
│       └─ <session> ─────┤→ Live-session screen
└─ Scratch ───────────────┘  ad-hoc sessions under ~/.relay/scratch/<id>/
[ + ] spawn → against a project, or new Scratch
```

Two top-level groups on the home screen:

- **Projects** — registered projects, each expandable to its sessions.
- **Scratch** — the "idea inbox": ad-hoc sessions, in the spirit of Claude Code's plans folder, each
  in its own sandbox under `~/.relay/scratch/<id>/`.

A persistent **+** affords spawn (against a project, or a new scratch session). Tapping any session
opens the live-session screen.

## 2. Live-session screen (compose-first + control rail)

Top → bottom: **terminal viewport · control rail · compose buffer.**

```
PHONE · portrait
┌──────────────────────┐
│ scratch/idea · ●live  │  header: session id + status
├──────────────────────┤
│                      │
│   TERMINAL           │  xterm.js viewport
│   (live output)      │  ~55% height, scrollback
│                      │
├──────────────────────┤
│ Esc  ^C  Tab ↑↓ ⏎ ⌥  │  CONTROL RAIL (keyless control)
├──────────────────────┤
│ ▷ draft text…     🎤 │  COMPOSE BUFFER
│                [Send] │  voice → here, edit, explicit send
└──────────────────────┘
   raw toggle ⤳ buffer becomes direct per-keystroke passthrough
```

- **Terminal viewport** — xterm.js, ~55% of the screen, scrollable. Renders the live PTY of the
  real server-side agent. Plan mode, interactive prompts, and diff approval all happen here, exactly
  as on the laptop.
- **Control rail** — the keyless affordances: `Esc · Ctrl-C · Tab · ↑ ↓ · Enter · ⌥(mode)`. `mode`
  sends the plan-mode cycle (Shift+Tab). These send raw control bytes through the input path. See
  [`server-touchpoints.md`](server-touchpoints.md) §2 for the claim/release subtlety (a bare control
  key is not a newline, so the rail must send-then-release rather than hold the claim).
- **Compose buffer** — the **default** input. A draft text area + 🎤 + **Send**.
  - **Voice (FR-6):** the phone's built-in keyboard dictation writes into the draft; it **never
    auto-sends**. You review/edit (dictation is lossy), then tap Send, which does one
    `CLAIM → SEND → RELEASE`. A *custom* in-app mic / transcription engine is deferred (D-18 §4) —
    OS dictation covers the experience for MVP.
  - **Raw toggle (FR-7):** flips the buffer into direct per-keystroke passthrough
    ([`ND-24`](../../decisions/ND-24-per-keystroke-input-streaming-for-tui-agents.md)) for moments
    you must drive interactively.

## 3. Spawn & scratch flows

- **Spawn against a project:** pick project → new session → land on the live screen.
- **Scratch spawn (the "idea in the wild" path):** one tap → server `mkdir`s
  `~/.relay/scratch/<id>/`, registers it as a lightweight project (keeps `project_id NOT NULL`
  satisfied — no schema change), and spawns `claude` there. The user's `~/.claude/skills` apply
  automatically (G-4) — no wiring. Brain-dump (voice/type), Send, close the app; the session keeps
  running (FR-14).
- **Create a project from the phone:** mobile has no local workspace, so this `mkdir`s-or-specifies a
  server-side directory and registers it. See [`server-touchpoints.md`](server-touchpoints.md) §1.

## 4. File viewer (conditional, separable)

Read-only **file tree** + **light text viewer** (view, not edit) over the session's working dir. No
diff-approval screen (approve in the TUI), no editing (remote VS Code covers that). Built as an
isolated module so it can drop to a fast-follow without touching the terminal core.

## 5. Status awareness

The sessions list shows **running / idle**, derived from PTY output activity (bytes flowing =
running; quiet for N seconds = idle). No "waiting-for-input" heuristic (unreliable over a PTY). No OS
push for MVP — in-app status only.

## 6. Cross-cutting consequences (designed-around, not bugs)

- **ND-39 clamp.** When your phone and a left-open laptop are both attached, the PTY clamps to the
  *smallest* viewport ([`ND-39`](../../decisions/ND-39-concurrent-multi-client-attach-tui-rendering-corruption.md))
  — the laptop's terminal shrinks to phone size. Acceptable when you've walked away; documented, not
  fought.
- **Claim / BUSY.** A walked-away laptop's claim auto-releases after inactivity
  ([`ND-01`](../../decisions/ND-01-claim-lock-timeout-duration.md)), so the phone takes over input
  cleanly; live contention surfaces the [`ND-02`](../../decisions/ND-02-rejection-ux-for-busy-response.md)
  indicator.
