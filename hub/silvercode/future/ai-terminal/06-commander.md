# Commander — the super-shell (shell + tmux + CAP UI in one silvery-app)

**Goal**: one silvery-app that is simultaneously a rich shell, a tmux-equivalent multiplexer, and a CAP-native command runner. The super-shell. Text-input is one component among many; panes/splits/tabs are first-class; block output is typed.

## Reframe

Earlier framing separated:
- "shell" (standalone zsh-replacement)
- "commander" (UI-first command runner)
- "multiplex" (tmux replacement)

This was wrong shape. **User's framing (2026-04-23)**: the super-shell subsumes all three. You launch one app. You get:

- Rich shell (line editor, completion, history, syntax highlighting)
- Multiplexer (splits, tabs, sessions, attach/detach)
- Palette (CAP-aware, intent-first, keyboard + mouse)
- Block output (typed renderers for tables/logs/diffs/images)
- Flag forms (type-safe input for complex commands)
- AI integration (conversation as blocks; commands as typed calls)

All in one app. All shared focus graph. All composable with km, notes, kanban, calendar — whatever else silvery renders.

## Why integration wins

The three-product split was driven by fear of scope. The integration wins are too strong:

- **One history, one palette, one completion index** — no context switching between shell and tmux and palette
- **Blocks cross pane boundaries** — run a command in pane A, pipe its typed output into pane B without re-execute
- **Sessions are first-class** (see [07-sessions.md](07-sessions.md)) — `bg`, `fg`, `jobs` work across panes naturally
- **Same keybinding surface** — muscle memory applies everywhere
- **Same rendering** — no alt-screen transitions between modes

Warp's mistake: alt-screen always. We don't have to repeat it.

## Why text-input is *one* component

- Expert speed for composable ops: `cd ..; git st; npm t`
- Muscle memory: zshrc, fzf bindings, aliases
- Universality: every server, blog, agent speaks shell
- Agent compatibility: every coding agent emits shell

But text is insufficient for everything. So:

- `<CommandInput>` — text REPL, the line editor (silvery `TextInput` + completion + history + syntax highlighting)
- `<CommandPalette>` — fuzzy + intent-ranked picker; AI-translates non-matching input
- `<FlagForm>` — structured input for complex flags (file pickers, branch pickers, typed enum selectors)
- `<BlockList>` — historical typed output; searchable, filterable, hoverable
- `<ResultPane>` — focused block detail, often with re-run / edit-flags / branch actions
- `<PromptBar>` — current-state bar (cwd, git, AI context, session info)
- `<SplitLayout>`, `<TabBar>`, `<PtyPane>` — multiplex components (see [04-multiplex.md](04-multiplex.md))

Focus moves between them. "Shell mode" = focus in text input. "Palette mode" = focus in palette. "Commander mode" = focus in block list. Same app, same session, different focus.

## Exec engine

Two candidates:

### Bun Shell (`Bun.$`)

- Fast — Zig parser, in-process, no fork-exec for builtins
- Cross-platform (Windows, macOS, Linux)
- Cross-runtime (works in Bun; not in Node / browser)
- Globs, redirects, pipes, builtins all handled
- Built on the shell tagged-template-literal pattern popularized by Google's [`zx`](https://github.com/google/zx) and refined by Deno-era [`dax`](https://github.com/dsherret/dax)

Estimate with Bun.$: shell REPL baseline in **3–4 weeks** (vs 6 weeks rolling our own).

### `dax` (cross-runtime alternative)

[`dax`](https://github.com/dsherret/dax) — Deno-origin, Bun/Node-compatible, same tagged-template API as zx but with cross-platform shell builtins. Runtime-agnostic.

Cost: carries a dependency, not as fast as Bun.$, smaller maintainer base.

Benefit: commander can ship in a browser-native form (see [big-ideas.md](big-ideas.md) — web-native deployment) where Bun doesn't exist.

### Recommendation

**dax as the portable path; Bun.$ as fast-path optimization when available.**

```typescript
const shell = await import.meta.runtime === 'bun' 
  ? createBunShell()  // Bun.$ wrapper
  : createDaxShell();
```

The exec interface is small (spawn, pipe, redirect, glob, env). Swapping between them is cheap. Don't lock the whole commander to Bun when `dax` keeps us portable.

## Unique to commander (beyond text shell)

- **Structured flag inputs** — forms with typed fields, file/branch pickers — zero quoting bugs
- **Parallel / DAG execution with visual composition** — replaces `&`, `wait`, `&&`, `xargs -P`, `make`
- **Typed result rendering** — JSON → tree, CSV → table, log → filter view, image → inline
- **Native block composition** — output of A as input to B without re-running A
- **Agent composition flow** — agent suggests DAG, user sees it visually, approves / edits
- **Structured search across history** — cwd, exit code, duration, output substring, CAP intent

## Unique to shell-input (beyond palette)

- Expert speed (see above)
- Text composability — `find | xargs rg | wc -l` has no tedious-free UI equivalent
- Universality — every server, blog, agent speaks shell
- Muscle memory — zshrc, fzf bindings, aliases
- Agent compatibility — every coding agent emits shell

## Scrollback-first rich UI (the Warp differential)

**Warp's mistake**: alt-screen always. Loses scrollback, terminal selection, SSH transparency, muscle memory. Our wedge: **scrollback-mode DEFAULT, full-screen OPTIONAL** — both share same components, same CAP substrate.

### Scrollback-mode features (silvery ANSI into real scrollback)

- **Ghost suggestions** (CAP-ranked, typed — zsh-autosuggest++)
- **Transient popups below prompt** (completion, history, intent search) — erased on dismiss
- **Mouse hover docs** on flags / commands (from CAP manifest)
- **Click past blocks** to focus / rerun / edit
- **Inline multi-line editor** for long commands
- **Flag forms inline** (Tab on `git commit` → form opens, Esc dismisses)
- **Live help while typing flags** (streaming from manifest)
- **Structured blocks rendered inline** (tables, logs, diffs, images)

### Full-screen mode (hotkey to toggle)

- Side-by-side block browser + input
- Live log filtering (focus a `log` block → filter bar)
- Pinned blocks dashboard
- Pipeline DAG composer
- Agent-chat sidebar always visible
- Multi-pane layout (splits, tabs) — tmux mode

The full-screen mode IS the multiplexer UI. No separate mux app. (See [04-multiplex.md](04-multiplex.md) for the primitives.)

## AI-native flow (dissolve shell-vs-AI distinction)

**AI as a CAP app.** Manifest declares intents/outputs; AI's output is blocks; AI's command proposals are typed CAP calls (previewable, editable, type-checked), not shell strings. Strictly safer than AI-generates-bash because CAP manifest constrains flags.

### Prefix-free disambiguation UI

As you type, commander shows interpretations live:
- Matches CAP command → run directly
- Doesn't match → AI-translate; show typed CAP call preview with flag values
- Ambiguous → disambiguation bar with [Enter run] [Tab edit-form] [! force-literal] [Esc]
- Ghost AI suggestion appears inline as you type (Copilot-style)

### Block-anchored AI actions

Hover any block → [explain] [fix] [rerun-with-edits] [summarize]. AI has block context; response is a new block referencing source.

### Conversation as a block thread

AI turns = child blocks. Can branch, collapse, filter. State is structured, not scrolled-off text.

## Warp differential

- Works over SSH transparently (scrollback mode)
- Works without alt-screen (scrollback mode)
- Mouse hover docs
- Open protocol (CAP) for any CLI to adopt — Warp is proprietary blocks
- Cross-target (web, canvas) — Warp is desktop-only
- OSS / BYOK
- Built-in multiplexer (no "use tmux inside Warp")

## Phases

| Phase | What | Effort |
|---|---|---|
| 1 | `<CommandInput>` + dax/Bun.$ exec + block emission (text REPL baseline) | 3–4 weeks |
| 2 | `<CommandPalette>` fuzzy discovery + history + AI translation | 1–2 weeks |
| 3 | `<FlagForm>` + per-command schema (git, npm, docker, gh) | 2–3 weeks |
| 4 | `<BlockList>` + typed renderers (table / JSON / log / image / diff) + hover docs | 2–3 weeks |
| 5 | DAG composition + visual parallel / sequential | 2–3 weeks |
| 6 | Full-screen mode: splits/tabs/multiplex, live log filtering, agent-chat sidebar | 2–3 weeks |

Each phase delivers visible value. After Phase 1: a shell. After Phase 2: a better shell. After Phase 4: genuinely novel. After Phase 6: category-defining.

## Package naming

- `@silvery/commander` — the silvery-app (umbrella)
- `@silvery/command-input` — text REPL component (usable standalone)
- `@silvery/command-palette` — fuzzy discovery component (reusable — km could adopt)
- `@silvery/block-list` — historical results UI (reusable)
- `@silvery/command-schema` — registry of flag schemas per command
- `@silvery/multiplex` — panes/splits (shared with other consumers; see [04-multiplex.md](04-multiplex.md))

## Integrated vs standalone

Both. Commander works standalone in any host terminal (iTerm/Ghostty/Kitty/bash/zsh). Progressive enhancement when running inside another silvery-mux instance (richer OSC streams, direct daemon channel via FD inheritance instead of parsing output). Nothing is forced.

## Explicit non-scope

- POSIX compat layer (use bash for scripts via shebang dispatch)
- zsh/bash plugin compat (users choose)
- Daily-driver replacement of zsh/bash for general users (agent / power-user / km-user first)
- Feature parity with fish's UX polish as a goal (start with useful, iterate)

## Consumers

- Agent harness — commander is the shell inside each agent pane
- silvery-showcase coding-assistant demo
- Standalone users who want structured-data + agent-aware features
- km (terminal panes alongside kanban + calendar + notes)

## Dependencies

- `@silvery/pty` — [01-building-blocks.md](01-building-blocks.md)
- `dax` (or `Bun.$` via dual-import) — exec engine
- CAP protocol — [05-cap-protocol.md](05-cap-protocol.md)
- Silvery components (TextInput, PickerDialog, etc.)
- `recall`-shape block index for cross-pane search

## Origin

2026-04-23 discussion. Started as "own shell" bead. Reframed as commander (UI-first + text-input) when user called out the shell-vs-commander angle. Reframed again as "super-shell with tmux capabilities" when user added multiplex to the commander scope.

## Prior art: ruvnet/claude-flow (added 2026-04-24)

[`ruvnet/claude-flow`](https://github.com/ruvnet/ruflo/wiki/Stream-Chaining) is the closest existing implementation of one specific commander capability — Phase 5's DAG composition — but for agents only and via declarative config rather than interactive composition.

**What it is:** a pipeline orchestrator that chains `claude -p` subprocesses via `--output-format stream-json` → `--input-format stream-json`. Workflows are declared via `depends` arrays; supports linear chains and parallel-merge (multiple `depends` entries feeding one synthesis stage). Conditional routing is "future work."

**What it validates for commander:**
- Stream-json IS viable as inter-agent IPC. Tool calls and results survive pipe boundaries.
- Linear + parallel-merge is the minimum useful DAG vocabulary; that's the right starting API.
- Demand for "compose multiple agent invocations" is real, not theoretical.

**What it warns commander against:**
- **Declarative-workflow-file scope trap.** The `depends`-array YAML model is the on-ramp to reinventing Airflow / Temporal / LangGraph for agents. Commander's visual-composition framing is the deliberate dodge; resist scope-shrinking commander down to "claude-flow with a UI."
- **Single-vendor lock-in.** claude-flow assumes Claude is the only executor. Commander's CAP-typed-block model has to stay vendor-agnostic from day one.
- **Stream-json as universal block format is too narrow.** Stream-json is Anthropic-shaped. Commander needs CAP-typed blocks where AI conversation is one block type alongside table / log / diff / image. Don't anchor on stream-json as the IPC.
- **Fire-and-forget pipelines miss the point.** Commander (and Agent Workspace) treats human supervision, pause/resume, edit, handoff, branch as first-class. claude-flow's shape doesn't accommodate that. Don't lose it in commander.
- **Error model is early-prototype** ("malformed JSON breaks the chain, check logs"). Commander needs typed-block error variants and replay-from-any-node from v1.

**Surface coverage map (commander phases vs claude-flow):**

| Commander phase | claude-flow coverage |
|---|---|
| 1 — text REPL + exec | none |
| 2 — palette + AI translation | none |
| 3 — typed flag forms | none |
| 4 — typed block renderers | none (passes raw stream-json) |
| 5 — DAG composition | partial (linear + parallel-merge for agents only, declarative) |
| 6 — multiplex / splits / agent sidebar | none |

claude-flow occupies ~15% of one phase. Useful as proof-of-concept; not a starting point.

**The Agent Workspace MVP already absorbs the actually-portable piece** of claude-flow (bidirectional stream-json subprocess; see [00-agent-workspace.md](00-agent-workspace.md)). That ships now. The pipeline-composition layer is what commander adds *if and when* commander gets re-opened — and at that point we'd want commander's CAP-typed-block universality, not claude-flow's stream-json-only narrowness.
