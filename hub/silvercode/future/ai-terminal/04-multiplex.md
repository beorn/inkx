# Multiplex: tmux-shape primitives as components, not an app

**Goal**: ship tmux-equivalent capabilities as silvery components + a daemon, rather than as a standalone binary. Framework-first: the product is the API, not the multiplexer executable. A standalone tmux-replacement binary would be one of several consumers alongside the agent harness, km with embedded panes, and commander.

**Note**: commander (see [06-commander.md](06-commander.md)) is itself one of the consumers — the user's framing is that the "super-shell" has tmux capabilities built in. So multiplex primitives live in `@silvery/*` packages; commander composes them into a user-facing shell+multiplexer product.

## Why framework-shape, not app-shape

- Silvery is already a component framework with web ambitions — an app-shape tmux replacement would be off-brand.
- Every real consumer (km, agent harness, commander, silvery-showcase) wants multiplex-like capabilities composed with non-terminal UI, which tmux cannot do.
- Nobody has "drop a pty-pane into your React app" — that shape doesn't exist today.
- Same `<PtyPane>` ships three renderers via silvery's multi-target story (vterm-in-cells for terminal, vterm grid on canvas, xterm.js on DOM); one codebase, remote-terminal web apps fall out.

## Component surface

### Primitives (packages)

- `@silvery/pty` — PTY wrapper (shared with everything; see [01-building-blocks.md](01-building-blocks.md) § Missing)
- `@silvery/emulator` — vterm wrapper; grid model + ANSI parsing
- `@silvery/multiplex` — daemon client, session persistence, attach/detach

### Components

- `<SessionProvider daemon="…">` — attach/detach root; wraps a React tree in a daemon connection
- `<PtyPane command cwd onExit onOutput>` — one pty + emulator + key routing + rendering
- `<SplitLayout direction ratios>` — splits (flexily)
- `<TabBar>` — tmux windows as tabs, with rich per-tab metadata
- `<ScrollbackView paneId>` — scrollback + copy-mode + search
- `<StatusBar>` — composes any silvery content (vastly more expressive than tmux format strings)
- `<CommandPalette>` — the `:` prompt, as a silvery `/` picker

### Hooks

- `useMultiplex()`, `usePane()`, `useScrollback(paneId)`
- `usePrefixKey(prefix, bindings)`, `useCopyMode(paneId)`

## Daemon approach

Session persistence (surviving client disconnect) is tmux's killer feature and the hard part in a framework. Three options:

1. `<SessionProvider>` transparently spawns/connects on mount (hides complexity; bad for cross-client sessions).
2. Separate `@silvery/multiplex-server` package, explicit opt-in (clearer; more setup).
3. **Piggyback on bearly's existing daemon** — already running, already does JSON-RPC over UDS, already knows about sessions. Extend it to own PTYs.

**Recommendation: option 3.** bearly/tribe already has the session-coord daemon, idle-quit, JSON-RPC, session registration. Extending it to own PTYs is ~1-2 weeks of work vs building new daemon infrastructure.

## MCP-server positioning (potentially more interesting than tmux-shape)

The wire protocol overlaps heavily with MCP (JSON-RPC over UDS / WebSocket). **If the daemon IS an MCP server**, every pane becomes addressable by any MCP client:

- `multiplex.read_grid(paneId)` — read visible cells
- `multiplex.inject_keys(paneId, keys)` — send input
- `multiplex.wait_for_pattern(paneId, regex, timeout)` — block until match
- `multiplex.spawn_pane({command, cwd})` — create new pane

That shifts the novelty from "better tmux" to "composable, scriptable terminal substrate for agents" — which is more defensible and directly unlocks the agent-harness + agent-authoring use cases.

## Explicitly not scope

- Opinions about prefix keys, config file format, default keybindings — consumers decide
- tmux format-string DSL — replaced by React composition
- tmux's 1000+ options — exposed as props on relevant components only when needed
- Plugin tpm-style shell plugins — plugins are just silvery components
- Feature-parity with tmux as a goal — "capabilities users actually need" as the goal

## Consumers

- **commander** (L3) — rich-shell super-app; panes/splits/tabs are first-class inside commander itself
- **agent-harness** (L5) — Claude Code / Codex adapter + meta-agent on top
- **silvery-showcase** coding-assistant demo
- **km** with embedded PTY panes alongside kanban views
- **silvery-mux** — standalone tmux-replacement binary, if we ever want one (optional, downstream)
- Hypothetical third-party dev-tools TUIs — ecosystem flywheel

## Hard-problem catalog

Conceptual frame: we are a **two-sided translator that must lie coherently in both directions**. Downstream, we claim a terminal identity to the child; upstream, we convert what the child sent through silvery to a host terminal with potentially weaker capabilities. Most problems below fall out of where that translation is hard.

### Forcing functions (get these wrong, nothing works)

1. **Nested rendering isolation.** Child's byte stream must terminate entirely in vterm (never reaches the real terminal). vterm maintains grid; silvery renders grid as cells. No escape sequence leaks past pane bounds.
2. **Capability lying (both sides).** See [01-building-blocks.md](01-building-blocks.md) § Capability-translation layer. Claims must be deliverable via silvery's bridge. Some cheap (mouse reporting), some expensive (graphics), some impossible (GPU compositing on non-GPU host).
3. **Input encoding modality.** Track child's active keyboard mode (legacy / CSI u / fixterms / kitty protocol), mouse mode (X10 / SGR 1006 / URXVT / pixel), bracketed paste. Decode host input, re-encode for child's current mode. Disciplined input queue with flow control.

### Rendering correctness

- DECSET 2026 sync updates — either respect or idle-coalesce
- Alt-screen swap/restore with per-screen scrollback policy
- Per-pane scrollback virtualization; user scroll is pane-local; memory cap + disk spill
- Width table coherence (silvery oracle used for both sides, or probe host)
- Frame budget under loud children — coalesce, cap frame rate, drop intermediates

### Semantic state

- Cursor visibility/shape routing (focused vs. ghost vs. hidden)
- OSC 0/1/2 title routing to pane/tab/window
- OSC 52 clipboard gating (prompt-injection vector)
- OSC 8 hyperlink preview; don't auto-open
- OSC 133/633 semantic prompt marker parsing (block model — see [05-cap-protocol.md](05-cap-protocol.md))

### Process / lifecycle

- TIOCSWINSZ debounce (some TUIs break on mid-render resize)
- Signal translation (line-discipline for pagers/REPLs; raw pass-through for TUIs)
- Daemon-owned PTYs; detach semantics; zombie reaping
- Env consistency (TERM/COLORTERM/COLUMNS/LINES/PWD matches claimed persona)

### Daemon / collaboration

- Wire protocol: JSON-RPC control + binary framing for grid stream (MCP with binary ext or separate channel)
- Session persistence: disk-backed scrollback for detached sessions; attach-snapshot delivers full grid + delta
- Multi-client attach (both see updates, last-write-wins for input, cursor ownership TBD)

### Security

- Escape injection via untrusted content (agent cats evil.log) — OSC 52 gated, OSC 8 sanitized
- Agent compromise containment — PTY isolation plus shared-daemon audit

### Agent-specific

- TERM_PROGRAM identity choice: xterm-ghostty vs. silvery-mux vs. xterm-256color (tradeoff: lying as something specific forces delivery on its quirks)
- Nested TUIs at arbitrary depth — identity must be PID-based not grid-based (meta-agent injects keys into a logical pane even when vim/less stack inside)
- Adapter parse fragility — prefer structured OSC events over grid parsing

### UX

- Focus routing (tmux prefix / click-to-focus / always-on chord — silvery focusScope expresses all)
- Cross-pane scrollback search (recall-shape live index)
- Replay determinism (grid-state-equivalence at logical steps, not bit-equivalence)
- Observability surface: PTY byte trace, vterm parser events, silvery render events — correlated, filterable, replayable

### Performance at scale

- Fair scheduling across loud/quiet panes; input priority over output
- Memory ceilings with LRU eviction and disk spill
- Cold start: lazy grid deserialization; paint visible first, scrollback on demand

## Prior art & lessons

### Warp — borrow the block model

- Each command = discrete {input, output, exit_code, timing, timestamp} block. Transforms the terminal from a byte stream into structured documents. Copy-just-output, permalink-errors, visual navigation all fall out.
- Achieved via OSC 133/633 + custom shell hooks. **We can do block detection passively from OSC markers** — don't require users to install our shell hooks.
- Action: `<PtyPane blockMode>` groups output into blocks on prompt boundaries. `<BlockList>` renders blocks as silvery cards with copy/share/rerun actions.
- Also borrow: **IDE-style command line** — prepend a `<TextInput>` (with completion, history, multi-cursor) in front of the shell. silvery already has the text input; wiring is trivial.
- Also borrow: **collaboration/permalink shape** — pane permalink, session permalink, replay permalink. Natural given our .tape format.

### cmux — validates the primitive-not-solution framing

- cmux ships exactly the MCP-substrate shape (read-screen, send, notifications, socket API) as its explicit philosophy. Agents use it. Strong validation that this is the right abstraction.
- **Rich per-pane metadata is a moat.** Git branch, PR number+status, cwd, listening ports, last notification — derived state, bubbled to the tab UI. tmux can't do this. Action: pane-level metadata providers (git, process-listen, OSC-notification), rendered by `<TabBar>`/`<StatusBar>` consumers.
- **OSC 9/99/777 notification pipeline.** Parse from the PTY stream, emit structured events. Ship a `silvery-mux notify` CLI that agents can hook into.
- **Structured event extraction from the terminal stream.** The substrate should parse and emit: prompt boundaries (OSC 133), notifications (OSC 9/99/777), cwd (OSC 7), title (OSC 0/2), hyperlinks (OSC 8), clipboard (OSC 52). Agents consume typed events, not the painted grid (where possible).

### Where we stay differentiated

- **Component-shape across targets** — Warp + cmux are monolithic apps; neither ports. Same `<PtyPane>` on terminal/canvas/DOM → remote/web-native terminals without rebuild.
- **Record/replay** — Neither Warp nor cmux has .tape-equivalent. With TEA state machines, we can do deterministic replay of agent sessions.
- **Composes with non-terminal UI** — km cards + PTY panes + silvery forms in one layout. cmux has tabs but each tab is a terminal.
- **BYOK, auditable** — Warp is closed-source with subscription gating; we're free and source-available.

### What not to borrow

- Warp's shell-hook requirement for blocks — optional, not required
- Warp/cmux macOS-native-only scope
- Warp's AI subscription model / closed source
- Bespoke socket protocols — we speak MCP

## Phases

1. **Primitives** — `@silvery/pty`, `@silvery/emulator`, `@silvery/multiplex` daemon skeleton with spawn/attach/detach
2. **Components** — `<SessionProvider>`, `<PtyPane>`, `<SplitLayout>`, `<TabBar>`
3. **Scrollback & copy mode** — `<ScrollbackView>`, selection integration, search
4. **Status bar, command palette, scoped keybindings, polish**
5. **MCP-server wire protocol** — opens to external agents

## Sources

- https://www.warp.dev/blog/how-warp-works
- https://cmux.com
- https://github.com/manaflow-ai/cmux
- https://soloterm.com/cmux-vs-tmux

