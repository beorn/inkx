---
mentions:
  - km
id: "@km/silvery/multiplex"
aliases:
  - km-silvery.multiplex
  - km-silvery-multiplex
created_by: claude:6443387f
created_at: 2026-04-24T02:38:29Z
closed_at: 2026-04-24T06:15:33Z
close_reason: Moved out of beads (2026-04-23). Speculative brainstorming, not
  roadmap — docs at hub/silvery/future/ai-terminal/. Revisit after km + silvery
  1.0 ship, or when a concrete trigger emerges (showcase demo needs panes,
  CAP-adjacent opportunity, etc.).
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.multiplex
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T19:38:47Z
    created_by: claude:6443387f
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] Silvery multiplex: tmux-shape primitives as components, not an app @km/silvery #feature #P4

blocks:: [[@km/silvery]]

Ship tmux-equivalent capabilities as silvery components + a daemon, rather than as a standalone binary. Framework-first: the product is the API, not the multiplexer executable. A standalone tmux-replacement app would be one of several consumers alongside the agent harness, km with embedded panes, and the silvery-showcase coding-assistant demo.

## Why framework-shape, not app-shape

- silvery is already a component framework with web ambitions — an app-shape tmux replacement would be off-brand
- Every real consumer (km, agent harness, showcase) wants multiplex-like capabilities composed with non-terminal UI, which tmux cannot do
- Nobody has "drop a pty-pane into your React app" — that shape doesn't exist today
- Same `<PtyPane>` ships three renderers via silvery's multi-target story (vterm-in-cells for terminal, vterm grid on canvas, xterm.js on DOM); one codebase, remote-terminal web apps fall out

## Component surface

Primitives:

- `@silvery/pty` — PTY wrapper (shared with @km/silvery/agent-harness)
- `@silvery/emulator` — vterm wrapper; grid model + ANSI parsing
- `@silvery/multiplex` — daemon, client/server protocol, session persistence across detach

Components:

- `<SessionProvider daemon="…">` — attach/detach root
- `<PtyPane command cwd onExit onOutput>` — one pty + emulator + key routing
- `<SplitLayout direction ratios>` — splits (flexily already)
- `<TabBar>` — tmux windows as tabs
- `<ScrollbackView paneId>` — scrollback + copy-mode
- `<StatusBar>` — compose any silvery content (vastly more expressive than tmux format strings)
- `<CommandPalette>` — the ":" prompt, as a silvery `/` picker

Hooks:

- `useMultiplex()`, `usePane()`, `useScrollback(paneId)`
- `usePrefixKey(prefix, bindings)`, `useCopyMode(paneId)`

## Daemon approach

Session persistence (surviving client disconnect) is tmux's killer feature — and the hard part in a framework. Three options:

1. `<SessionProvider>` transparently spawns/connects on mount
2. Separate `@silvery/multiplex-server` package, explicit opt-in
3. **Piggyback on bearly's existing daemon** — already running, already does JSON-RPC over UDS, already knows about sessions. Extend it to own PTYs. Likely the right call.

## MCP-server positioning (potentially more interesting than tmux-shape)

Wire protocol overlaps heavily with MCP (JSON-RPC over UDS / WebSocket). If the daemon IS an MCP server, every pane becomes addressable by any MCP client: "read grid of pane X", "inject keys into pane Y", "wait for pattern in pane Z". Moves the novelty from "better tmux" to "composable, scriptable terminal substrate for agents," which is more defensible and directly unlocks the agent-harness use cases.

## Explicitly not scope

- Opinions about prefix keys, config file format, default keybindings — consumers decide
- tmux format-string DSL — replaced by React composition
- tmux's 1000+ options — exposed as props on relevant components only when needed
- Plugin tpm-style shell plugins — plugins are just silvery components
- Feature-parity with tmux as a goal — "capabilities users actually need" as the goal

## Consumers

- @km/silvery/agent-harness (Claude Code / Codex adapter + meta-agent on top)
- silvery-showcase coding-assistant demo (project-silvery-showcase-app.md)
- km with embedded PTY panes (alongside kanban views)
- silvery-mux — standalone tmux-replacement binary, if we ever want one (optional, downstream)
- Hypothetical third-party dev-tools TUIs — ecosystem flywheel

## Phases

- Phase 1: primitives — @silvery/pty, @silvery/emulator, @silvery/multiplex daemon skeleton with spawn/attach/detach
- Phase 2: components — <SessionProvider>, <PtyPane>, <SplitLayout>, <TabBar>
- Phase 3: scrollback & copy mode — <ScrollbackView>, selection integration, search
- Phase 4: status bar, command palette, scoped keybindings, polish
- Phase 5: MCP-server wire protocol — opens to external agents

## Origin

2026-04-23 discussion extending @km/silvery/agent-harness. The harness was heading toward "tmux-for-agents" in its Phase 2 anyway; filing as sibling makes the dependency explicit and lets the primitive be general-purpose instead of agent-specific.

