# Building blocks: what we have, what's missing, the critical-path atom

## Inventory — the silvery terminal stack

These are pieces that already exist, each serving its own purpose, that compose into the substrate for AI-era terminal tooling.

### Rendering & emulation

- **`@vterm/modern`** (`vendor/vterm/packages/modern/`) — full-fat ANSI emulator. Grid model, all modes, scrollback, OSC parsing. 99% conformance on `terminfo.dev`. The "sole sink" for any nested child's byte stream — nothing escapes the grid.
- **`@vterm/vt100`** — VT220 baseline. 57% conformance. Used as low-end oracle; models what the most conservative clients will accept.
- **`silvery` reconciler** (`@silvery/ag-term`) — paints cells from React state. Our rendering sink reads vterm grid cells and emits silvery cells. Same tree also renders via canvas (v20) and DOM (v25+) targets.

### Input & selection

- **`silvery-selection`** — pointer, mouse, hover, focus-scope. Treats mouse/hover as first-class, not TUI afterthoughts.
- **Key encoding pieces** scattered across silvery/ag-term — legacy xterm, CSI u, fixterms, kitty keyboard protocol, bracketed paste. Needs consolidation into a canonical `silvery-keyevent → bytes` encoder that honors the child's currently-active mode.
- **Bracketed paste** — already handled downstream (parse out BPM markers) and upstream (emit BPM on paste when host supports).

### Testing & automation

- **`termless`** — headless terminal driver. Can drive any silvery app or any child PTY through a virtual tty; captures output, cursor state, scrollback.
- **`mdtest` tape plugin** — VHS `.tape` record/replay format. Deterministically replay an entire TUI session from a key-event log. This is the format that makes agent runs auditable.
- **`terminfo.dev`** — our database of terminal capabilities across iTerm, Kitty, Alacritty, Ghostty, Wezterm, xterm, tmux, and everything else. Source of truth for "can this host render X."

### Layout & components

- **`flexily`** — Yoga-compatible flexbox engine. Underpins splits, tabs, tiles, responsive layouts.
- **Silvery components** — `Box`, `Text`, `SelectList`, `TextInput`, `VirtualList`, `PickerDialog`, `focusScope`, typography presets, semantic theme tokens (`$primary`, `$muted`, `$bg-cursor`, etc.).

### State & reactivity

- **`alien-signals`** (upstream, stackblitz) — signals/effects/computed.
- **`alien-projections`** (beorn) — derived arrays with key-stable caching.
- **`alien-resources`** (beorn) — async fetches with race cancellation.
- **`alien-trees`** (beorn) — tree aggregates (descendants-any, ancestor-inherits) in O(1).
- **`@silvery/signals`** — React bindings for the family. Efficient block/list/tree state without re-renders.

### Cross-session coordination

- **`bearly/tribe`** — JSON-RPC over Unix-domain-socket. Daemon idle-quits after 30m. Session registration, broadcasts, DMs, chief/member roles, hook-together event delivery. Today used for cross-Claude-Code coordination; naturally extends to in-session coordination between panes/agents.
- **`bearly/recall`** — FTS5 index of Claude Code session history. Sub-second search over months of sessions. MCP tools (`tribe.ask`, `tribe.brief`, `tribe.plan`) for agent-callable retrieval.

### Knowledge & memory

- **km itself** — a knowledge graph (nodes, links, tags, bidirectional md sync). For a coding agent, km is the long-term memory layer — stable across sessions, human-editable, git-tracked.
- **`gbrain`** — the vault behind `~/Bear/`; `gbrain search "topic"` returns prior personal context (journals, people, decisions).

### What none of the above do on their own

Each piece is narrow. Individually they'd be unremarkable dependencies. The thesis is that **composed**, they form something no commercial terminal vendor has: a full substrate for AI-era terminal work where every piece is typed, inspectable, replayable, coordinable, and cross-target.

## What's missing

Exactly one primitive.

### `@silvery/pty` — the critical-path atom

A PTY wrapper. Spawns a child process with a real pseudo-terminal on both ends. Child does `isatty(0)` / `isatty(1)`, sees "yes"; we get bytes back. Must handle:

- Forkpty / openpty / grantpt+unlockpt+ptsname syscall dance
- SIGWINCH + TIOCSWINSZ for resize
- Read/write loops with backpressure + flow control
- Close on child exit; signal propagation
- (Bonus) raw-mode toggles, ECHO/ICANON, line-discipline awareness

**Options**:

1. **node-pty** — mature npm library, FFI-backed. ~100 LOC of wrapper. Pros: works today, broad platform coverage. Cons: questionable maintenance cadence, native-module rebuild headaches on mac updates.
2. **`script(1)` shim** — wrap `/usr/bin/script`. POSIX-only (no Windows), but trivial. Good enough for v0 + dev-loop.
3. **Bun FFI into libuv's `uv_pty_t`** — cleanest long-term. ~1-2 weeks extra; zero native-module headaches; Bun-native performance.
4. **conpty** (Windows) — separate story; defer.

**Recommendation**: ship node-pty wrapper as v0, start Bun FFI track in parallel for v1. Never expose node-pty in the public API — keep it behind `@silvery/pty` so we can swap later without breaking consumers.

**This is the gating decision.** Every other piece of the catalogue depends on `@silvery/pty` existing. Ship it first; everything else parallelizes after.

## Capability-translation layer (second atom, needs design)

Given `@silvery/pty`, the next thing we need is the **capability-translation layer** — a two-sided translator between host terminal and hosted child.

### Downstream (child sees us)

We claim a terminal identity. Then:
- Answer `CSI c` / DA with our claimed ID's response
- Answer `CSI >c` / DA2 with secondary-DA response
- Answer `DSR` status requests
- Answer `XTGETTCAP` with terminfo entries from our claimed persona
- Answer `DECRQM` mode reports consistently with claimed state

The claim has to be deliverable. We can't claim Kitty if we're rendering on xterm-256color host. Persona choice is a knob: typically `xterm-256color` for maximum child compatibility, occasionally richer when the host supports it.

### Upstream (we paint to host)

We probe host at startup (via terminfo.dev + runtime queries). Then downsample on the way out:
- Truecolor → 256 → 16 if host doesn't support
- OSC 8 hyperlinks → plain text
- Kitty graphics → sixel → unicode blocks
- DECSET 2026 synchronized updates → no-op

silvery's existing rendering pipeline already does downsampling for its own rendering; we extend it to handle byte-passthrough sensibly.

### Input re-encoding

Keyboard input is encoded differently depending on the child's active mode (legacy xterm vs CSI u vs fixterms vs kitty protocol). Mouse events similarly (X10 / SGR 1006 / URXVT / pixel). Bracketed paste has its own framing.

We **track the child's active mode** (by parsing DECSET/DECRST sequences we see in the byte stream) and **re-encode host input for the child's current mode**. This is tedious but not hard; `termless` already has most of the pieces.

## Putting it together

```
                       ┌──────────────────────┐
                       │  Host Terminal       │
                       │  (iTerm/Kitty/...)   │
                       └────────┬─────────────┘
                                │ bytes
                                ▼
                    ┌─────────────────────────┐
                    │  silvery ag-term render │
                    │  (cells → bytes)        │
                    └────────────┬────────────┘
                                 │ silvery cells
                                 ▼
                    ┌─────────────────────────┐
                    │  React component tree   │
                    │  <PtyPane>, <BlockList> │
                    │  <StatusBar>, <Palette> │
                    └─────┬──────────────┬────┘
                          │              │
                 vterm grid             silvery cells
                          │              │
                    ┌─────▼────────┐     │
                    │ @vterm/modern│     │
                    └─────┬────────┘     │
                          │ byte stream  │
                    ┌─────▼────────┐     │
                    │ @silvery/pty │◄────┘
                    └─────┬────────┘
                          │ PTY
                    ┌─────▼────────┐
                    │ Child (bash, │
                    │ Claude Code, │
                    │ vim, ...)    │
                    └──────────────┘
```

The PTY wrapper feeds bytes into `@vterm/modern`. The emulator maintains a cell grid. silvery renders that grid as part of its component tree. Our ag-term reconciler paints the whole thing out to the host terminal.

Crucially, the child's byte stream **never reaches the host directly** — it's fully contained by the vterm grid, silvery picks up what to render from there. That solves nested-rendering isolation in one move.

## What's NOT in the critical path

- `cap-wrap` — first CAP consumer — important, but deferred until CAP itself has shape
- Daemon architecture for session persistence — v0 can run without, add later
- Block renderers beyond log/table/diff — expand over time
- Platform matrix — mac + linux first, Windows via conpty later

## Cost & timeline estimate

- `@silvery/pty` (node-pty v0): ~3-5 days
- PTY ↔ vterm glue: ~1 week
- Capability-translation layer: ~2 weeks (iterative, needs real-child testing)
- Input re-encoder consolidation: ~1 week
- Canonical `<PtyPane>` component: ~3-5 days
- First nested TUI working cleanly (vim inside a pane): ~3-4 weeks end-to-end

This is the floor for all of A–F in the README. Every downstream track starts after this lands.
