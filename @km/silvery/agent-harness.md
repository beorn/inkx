---
id: "@km/silvery/agent-harness"
aliases:
  - km-silvery.agent-harness
  - km-silvery-agent-harness
created_by: claude:6443387f
created_at: 2026-04-24T02:22:23Z
closed_at: 2026-04-24T06:15:45Z
close_reason: Moved out of beads (2026-04-23). Speculative brainstorming, not
  roadmap — docs at hub/silvery/future/ai-terminal/. Revisit after km + silvery
  1.0 ship.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.agent-harness
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T19:22:41Z
    created_by: claude:6443387f
    metadata: "{}"
  - issue_id: km-silvery.agent-harness
    depends_on_id: km-silvery.multiplex
    type: blocks
    created_at: 2026-04-23T19:38:47Z
    created_by: claude:6443387f
    metadata: "{}"
  - issue_id: km-silvery.agent-harness
    depends_on_id: km-silvery.sessions
    type: blocks
    created_at: 2026-04-23T22:47:42Z
    created_by: claude:6443387f
    metadata: "{}"
---

# [x] Agent harness: wrap and drive TUI coding agents (Claude Code, Codex, opencode) @km/silvery #feature #P4

blocks:: [[@km/silvery]], [[@km/silvery/multiplex]], [[@km/silvery/sessions]]

Wrap and drive TUI coding agents (Claude Code, Codex, opencode, aider-tui) inside silvery, with introspection, meta-agent oversight, and cross-agent memory. Private product (not necessarily OSS).

## What "wrap and drive" requires

- Real PTY (not spawn+pipe) — agents check isatty()
- Full ANSI emulator (alt-screen, mouse SGR 1006, bracketed paste, DEC modes, focus in/out)
- Capability negotiation (DA / DA2 / DECRQM / XTGETTCAP) — decide what we "lie as"
- Key encoding (CSI u / kitty protocol / legacy, all chords, mouse, bracketed paste framing)
- SIGWINCH / ioctl TIOCSWINSZ on resize
- OSC passthroughs (title, clipboard 52, hyperlinks 8, cwd 7, notifications, maybe kitty graphics / sixel)
- Introspection API (read visible grid, inject keys, wait-for-pattern)
- Session lifecycle (spawn / attach / detach / reattach / kill)
- Input mode routing (tmux-style prefix, or focus-based)

## What we already have (and nobody else does)

- @vterm/modern — ANSI emulator grid
- termless + tty MCP — headless driver / introspection shape
- terminfo.dev — capability database
- mdtest tape plugin — VHS .tape record/replay format
- silvery-selection + ag-term — key-event pipeline pieces
- bearly/tribe — multi-session coordination
- bearly/recall — session-history search
- silvery flexily — tile/split layout

No one else has this stack. tmux/Zellij have the multiplexer; no introspection, no replay, no cross-session memory. Claude-Squad is git-worktree + tmux, not an emulator. Warp/Wave embed AI into a terminal, don't host other agents.

## The gap

Must build:
- `@silvery/pty` — pty wrapper (single missing primitive, ~200 LOC + bindings; node-pty via Bun FFI, or `script(1)` fallback v0)
- PTY ↔ vterm glue (feed pty stdout into vterm.parse, render grid, encode key events back) — ~300 LOC
- Capability-response layer (intercept DA queries, respond as configured; can proxy from host terminal) — ~200 LOC
- Key-encoder completeness audit (consolidate existing pieces into canonical silvery keyevent → bytes with kitty/CSI u/legacy modes)
- `<AgentPane>` component (PTY + vterm + silvery render) — product atom

Should build (harness layer):
- Session manager (spawn/attach/detach/list, persistent scrollback)
- Tile/split layout (flexily already)
- Prefix-key routing
- Cross-pane scrollback search (recall-shaped)

Pays off later:
- Agent-specific adapters — Claude Code first (parse status line, tool-call boxes, permission prompts into structured events → "auto-approve Read calls", native tool-call UI). Codex, opencode when warranted
- Meta-agent (NL across panes, cross-agent beads, chief election via tribe)
- .tape recording of live agent sessions → replay into tests, demos, "redo with edits"

## Phases

- Phase 1 (primitive): @silvery/pty + <AgentPane>. Can run one Claude Code inside silvery. ~1 week
- Phase 2 (multiplex): session manager, tile, prefix keys, attach/detach. tmux-for-agents. ~1 week
- Phase 3 (automation): scaled introspection API, Claude Code adapter, meta-agent. ~2 weeks
- Phase 4 (moat): .tape recording, cross-agent tribe/recall, plugin surface. Ongoing

## Positioning

If private: daily driver for running N Claude Code / Codex sessions with shared memory, replay, meta-agent oversight. If ever OSS'd: tmux + Warp + claude-squad all partially approximate; none fully own.

## Origin

2026-04-23 discussion starting from "how does Cline do it?" — Cline doesn't; it piggybacks on VSCode's terminal (createTerminal + shellIntegration.executeCommand + OSC 633 markers). Standalone fallback is child_process.spawn with stdin=ignore. Neither is a terminal emulator — command runners with output capture. This bead is the silvery-native answer: a real emulator-based host for other TUI agents, which we can ship materially faster than anyone else because we already own the stack.