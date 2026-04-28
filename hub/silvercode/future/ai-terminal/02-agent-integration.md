# Agent harness — SDK-direct integration scaffold for wrapping & driving agents

**Goal**: build the **harness** — the infrastructure that takes an agent (Claude, GPT, etc.) and makes it runnable inside our app with typed events, policy gates, and silvery-component UI. Not the product itself; the scaffolding that a product sits on.

**Terminology** (see README § Terminology): this doc is about the **agent harness** — the integration scaffold. The **agent host** (user-facing product) is what sits on top (commander, or our silvery-native hosting app). The **orchestrator** (multi-agent coordination) is separate (see 07 + 08).

**Decision (2026-04-23)**: we own the launcher. Users run agents *through* our app, not independently. This collapses the harness to **Mode A** (structured output / SDK-direct) for the critical path — no PTY, no ANSI emulator, no capability negotiation needed for the agent itself.

## Mode A — structured output (the only path we commit to)

Spawn the agent in its non-interactive / stream-json mode. Parse structured events directly. Render in silvery components.

```bash
claude -p "prompt" --output-format=stream-json         # Claude Code
codex --json ...                                         # Codex
aider --message "..." --no-pretty ...                    # aider
opencode ... (check CLI — probably has JSON mode)         # opencode
```

Or, stronger still, **use the vendor SDK directly** (Claude Agent SDK for Claude; analogous for others) — skip spawning a CLI process at all; embed the agent loop in our harness. Same event model, more control (permission callbacks, hooks, custom tools).

**This is the entire integration track.** No PTY. No emulator. No capability games.

## What we lose — and what we rebuild

By running in structured mode, we give up Claude Code's native TUI chrome. **Every feature is either already in the event stream, or is client-side UI we rebuild in silvery.** We don't lose features — we move responsibility.

### Feature-parity matrix

| CC TUI feature | Type | How we get it in Mode A |
|---|---|---|
| Messages (user / assistant turns) | Stream event | Already in stream |
| Tool calls + results (Bash, Read, Write, Edit, etc.) | Stream event | Already in stream |
| **TodoWrite / todos** | Tool call | `tool_use` with `name:"TodoWrite"` carries the full updated list; we render `<TodoPanel>` |
| **Active sub-agents** | Tool call | `tool_use` with `name:"Task"` = spawned; matching `tool_result` = completed; we track in-flight with `<ActiveAgents>` |
| **Activity indicators** ("thinking…", "running X") | Derived | Computed from stream state — between user turn and assistant delta = thinking; during long tool_use = running |
| **Model used** | Session metadata | In init event; render in `<StatusLine>` |
| **Context % used** | Derived | Accumulate `usage.input_tokens` / `output_tokens` per turn; show in `<StatusLine>` |
| **Session name** | Client-side label | Ours to pick; rename is trivial |
| **Permission prompts (plan mode)** | Stream event | When `--permission-mode plan` or `ask` is set, tool calls surface as pending; we render `<PermissionDialog>` — richer than CC's modal (diff previews, per-file approve/deny, mouse) |
| **Mode switcher (plan / accept-edits / auto)** | Spawn config + client UI | Set at spawn; we build `<ModeSwitcher>` — toggle respawns or uses SDK's permission mode API |
| **`/compact` (trigger compaction)** | We own the conversation state | Strictly more control than CC's `/compact`. In Mode A we hold the history between `-p` calls (or in the SDK), so compaction is a function we call whenever we want — on-demand, auto-triggered, per-topic, per-persona, budget-driven. `/compact` being client-side means compaction is ours, not that we lose access to it. |
| **`/rename`, `/clear`, `/help`, `/doctor`, `/agents`** | Pure CLI chrome | Reimplement as our slash commands — often simpler (our `/agents` = the `<ActiveAgents>` view we already have) |
| **Status line chrome** | Pure UI | Render our own `<StatusLine>` from stream data |
| **Alt-screen chat-bubble UI** | Pure UI | We render in silvery — arguably better (scrollback-first, mouse hover, inline blocks, block-level actions) |

### What this means concretely

To reach feature-parity with CC's TUI in silvery, we build roughly:

- `<TodoPanel>` — reads TodoWrite tool calls
- `<ActiveAgents>` — tracks in-flight Task tool uses
- `<ActivityIndicator>` — derives state from stream
- `<StatusLine>` — model + context-% + our label
- `<ModeSwitcher>` — plan / accept-edits / auto
- `<PermissionDialog>` — intercepts and surfaces permission prompts
- `<SlashPalette>` — our slash commands
- `<MessageList>` / `<ToolCallBlock>` / `<ToolResultBlock>` — the conversation

Rough estimate: a few weeks of silvery work on top of a clean stream consumer. End state: **the same features, rendered in silvery components** — potentially richer than CC's TUI (scrollback-first, mouse hover, inline tool-call blocks, block-level actions, integration with commander + tribe + km-as-memory).

## Implementation stack

1. **Event ingest** — either `claude -p --output-format=stream-json` via `@silvery/pty` OR Claude Agent SDK embedded in-process
2. **Event normalizer** — typed event stream (turn-start, tool-use, tool-result, permission-request, session-end) in a shape that's vendor-agnostic
3. **Per-vendor adapters** — translate vendor-specific events to the normalized shape (Claude, Codex, opencode, aider each have different stream formats; normalizer papers over)
4. **UI components** — the silvery components above; generic, reused across all wrapped agents
5. **Meta-agent layer** — reads multiple normalized streams; coordinates via tribe; bead-creates work; routes permission escalations

## Agent SDK vs CLI — when to prefer which

| Consideration | CLI (`claude -p`) | SDK (`@anthropic-ai/claude-agent-sdk`) |
|---|---|---|
| Setup | Spawn a process | Import a library |
| Hook into lifecycle events | Hooks config file | Typed callbacks directly |
| Intercept permission prompts | Via stream `wants-permission` events | Via typed `canUseTool` callback |
| Define custom tools | Limited | First-class |
| Multi-agent in one process | N processes | N in-process instances (fibers) |
| Vendor independence | Different CLIs have different flags | Different SDKs have different APIs |

**For Claude specifically**: SDK is cleaner, especially given the supervision/fibers direction (see 08-supervision.md) where we want many agents in one worker process.

**For vendor-independence**: CLI streaming has a lower floor — every vendor-owned agent has some form of non-interactive JSON mode; not every vendor has an SDK we can embed.

**Pragmatic**: start with SDK for Claude (richest integration); fall back to CLI + JSON for vendors without a usable SDK.

## Decision (2026-04-27): opencode is consumed via ACP, not soft-forked

**Context**: Kilo Code's April-2026 rebuild revealed that opencode is now a productized OEM platform — Kilo soft-forked opencode (full repo at `packages/opencode/` with `kilocode_change` annotation discipline) and ships it as a multi-surface coding-agent product. Same pattern is open to anyone. The strategic question for silvercode: do we (a) consume opencode as an ACP backend, or (b) soft-fork it the way Kilo did?

**Decision**: **(a) — silvercode treats opencode as an ACP backend, not a runtime base.**

**Reasoning**:

1. **silvercode's moats are host-side, not runtime-side.** ambient-context-safety, `CrossAgentState`, subscription auth, two-region composer, hover-disclosure — none of these need a custom agent loop. They live one layer above whatever runtime we use. ACP is exactly the boundary that lets us keep that layer ours and outsource the runtime.
2. **Multi-backend is a moat; forking commits us to one engine.** silvercode's product identity is "any coding agent in a polished multi-pane host." Soft-forking opencode would either make silvercode-just-be-Kilo (wasted differentiation) or force us to maintain *both* a fork and ACP backends for other vendors (worst of both worlds).
3. **Reversibility.** ACP is a wire — if opencode disappoints, swap to Claude Code or Codex on the same socket. A soft fork is a one-way door: every commit deepens the maintenance load.
4. **The Kilo lesson is about opencode's engine quality, not about forking being inherently right.** Kilo had reasons we don't share (single-backend product, deep IDE-extension chrome to ship, capital to dedicate engineers to the runtime). silvercode is a multi-backend host and should stay one.

**Explicit fork tripwires (added 2026-04-27 from /pro enrichment)**:

The "stay on ACP unless something concrete forces fork" position is correct, but should not be vague. Re-evaluate fork the moment any of the following measurable conditions hits:

1. **The 60–90 day adapter test fails.** If silvercode cannot enforce ambient-context-safety isolation OR replay determinism via ACP adapters within 60–90 days of starting integration with a given backend, that backend's adapter is structurally inadequate. Document the failing scenario; if it's blocking on the backend's wire protocol (not silvercode's adapter logic), fork-or-skip becomes the question.
2. **Adapter friction exceeds 30% of eng time.** Track per-month: hours spent on adapter shims / hours spent on silvercode features. If ratio crosses 30% sustained for 2+ months, the wire boundary is too narrow. Either upstream the missing hooks (file PRs against opencode/Claude Code/Codex) or carve a maintained shim fork.
3. **Upstream refuses interfaces silvercode needs.** Specifically: diff-only edit APIs, tool permission gates, event streams for replay, ambient-channel preservation at the wire level. If a PR or issue against the backend gets `wontfix` or sits >90 days, that's a hard signal.
4. **A feature competitively requires runtime ownership.** Concrete example: if 60fps multi-pane diff-streaming requires synchronous interruption hooks ACP doesn't provide, and the latency cost of network-ACP makes silvercode feel sluggish vs Kilo. (The /pro Gemini take.)

**The "micro-fork" fallback pattern.** If forking ever becomes necessary, do *not* repeat Kilo's mistake of full-codebase divergence. Instead:

- Maintain a **slim shared core** (mirror of upstream, sync regularly)
- Plus a **maintained patch set** focused narrowly on the missing hooks (ambient-safety, replay events, file-claim integration)
- Use upstream's `kilocode_change`-style annotation discipline if forking from opencode (CI-enforced markers)
- Stay rebaseable; never let the patch set drift more than ~2 weeks behind upstream

This is the "stay-light-when-you-must-fork" pattern. Kilo's full April-2026 rebuild on opencode is the cautionary tale: their pre-rebuild Cline soft-fork accumulated enough divergence that they had to abandon it entirely.

**Sidecar pattern as a middle path (worth prototyping).** Per /pro Gemini's suggestion: don't full-fork, but inject a silvercode-specific binary into the backend's execution environment for synchronous state interruption + deep file claims. Avoids both full-fork maintenance and pure-network-ACP latency. Worth building a 2-week prototype against opencode if pure ACP feels sluggish in the squad-mode validation.

That's the rule set. Until any tripwire fires, we stay on ACP. The fork option is documented here, with explicit triggers, not parked vaguely.

**What this means in practice**:

- Implement an ACP client for opencode in silvercode's vendor adapter layer alongside Claude Code, Codex, Gemini, Copilot.
- opencode becomes one selectable backend per pane (`silvercode --agent opencode`).
- Ambient-context-safety, cross-agent state, and composer behavior remain silvercode's responsibility — opencode never sees structurally-distinct ambient blocks; silvercode applies the framing before the wire.
- If/when opencode ships ACP server features that aren't yet specced, file upstream PRs rather than fork.

**Cross-references**:

- Detailed Kilo write-up: [`09-agent-host-landscape.md` § Kilo Code](09-agent-host-landscape.md)
- ACP wrapper ecosystem: [`10-agent-router-landscape.md` § A4 — ACP as transport](10-agent-router-landscape.md)
- silvercode ACP approach: [`silvercode-agent-acpp.md`](silvercode-agent-acpp.md)

## Appendix: the modes we de-scoped

### Mode B — tail JSONL session files (optional memory layer)

Claude Code writes `~/.claude/projects/<project>/<session-id>.jsonl` for every session. Tailing this gives:

- Cross-session memory (all historical sessions searchable)
- Passive observation of user-driven sessions (they ran `claude` outside our app)
- Multi-reader (many processes can tail same file)
- Crash resilience (events on disk survive reader crashes)

**Not in the critical path.** Add later as an ambient-memory feature if useful. The canonical path is Mode A (we own the launcher).

### Mode C — full PTY + ANSI emulator wrap (fallback)

Full TUI wrapping with ANSI emulator, capability negotiation, introspection. Only needed if we must preserve an agent's native visual identity, or if we're wrapping an agent with no structured-output mode at all.

**Not in the critical path.** Could become relevant if a vendor ships a valuable tool without an SDK or JSON mode — we wrap it as Mode C and live with the complexity. Skip for v0.

### Why `TERM=dumb` is not a shortcut

Tempting idea: force line-based output via `TERM=dumb`. Doesn't work:

- Claude Code checks `isatty()`, not `TERM` — renders full TUI when given a PTY regardless
- Same for Codex, Cursor CLI, aider TUI
- Subprocesses agents invoke (vim, less, fzf) reach for real terminals independently
- Output would be lossy — no tool-call boxes, no permission UI, no status line structure

`TERM=dumb` is a 1990s trick for 1990s tools. The right knob for coding agents is `-p --output-format=stream-json` or the SDK.

## Comparison — how others integrate coding agents

Worth knowing, because the industry has converged on structured events.

### Agent hosts (Cline, Continue, GitHub Copilot, Cursor, opencode, aider)

These are all **agent hosts**, not wrapped agents. They **do not spawn Claude Code / Codex CLIs**. They go **SDK / API-direct**:

- **Cline**: was VSCode-extension-only; now also ships a **TUI** alongside. Both surfaces share agent logic — SDK-direct agent loop, multiple rendering surfaces (VSCode webview *and* terminal UI). Confirms the cross-target thesis we're betting on for silvery.
- **Continue**: OSS, SDK-direct, provider-pluggable. VSCode + JetBrains.
- **GitHub Copilot**: direct API against the Copilot backend. Multiple IDE integrations.
- **Cursor**: fork of VSCode with its own agent backend.
- **Claude Code's own VSCode extension**: coordinates with a running Claude CLI via IDE integration IPC (for "open this file in Claude" actions), not spawning.
- **opencode, aider, crush, mods**: TUI agent hosts — same pattern, own agent loop, SDK-direct.

**Pattern at the agent-host layer**: whoever owns the host uses SDK-direct. Wrapping someone else's *host* by parsing terminal output (e.g., shipping "an opencode wrapper") is a dead path.

**Cline's dual-surface architecture is a particularly strong signal for us**: they decoupled agent logic from rendering surface exactly the way silvery's multi-target thesis says components should. Same agent, VSCode webview, TUI — different surfaces, shared logic. We'd be doing the same thing with silvery's terminal + canvas + DOM targets.

### Correction (2026-04-26): wrapping isn't dead — it just moved up a layer

The earlier framing of this section — "nobody important wraps someone else's TUI; that path is dead" — was wrong as a sweeping claim. It is true at the *agent-host* layer (Cline, Continue, opencode, aider, Cursor — all SDK-direct, none spawn another agent CLI).

It is **demonstrably wrong at the meta-orchestrator / router / gateway layer**: as of 2026 there are at least seven shipping projects whose entire value proposition is wrapping other agent CLIs as subprocesses — OpenClaw, claude-squad, opcode, vibe-kanban, happy, conductor, hermes-agent (planned). Three transport patterns are converging:

1. **A1 stream-json** (subprocess + `--output-format stream-json` parser): OpenClaw, opcode, vibe-kanban — the de-facto pattern
2. **A2 PTY + screen-scrape**: claude-squad — fragile, English-string substring matching, but reproduces the wrapped agent's UI faithfully
3. **A3 fd3 sideband**: happy — keeps the local TTY usable, sidebands events to a relay
4. **A4 PTY + ACP**: hermes-agent (roadmap) — Zed's Agent Client Protocol; the only candidate for an industry-standard contract

See [10-agent-router-landscape.md](10-agent-router-landscape.md) for the full Type-A deep dive (architecture, data shapes, backend matrices, what to steal, what to avoid).

What we actually want for silvery, unchanged from before:

1. **For Claude Code specifically**: use the Claude Agent SDK. Not the CLI.
2. **For other vendors**: use their SDKs where available; `-p --output-format=stream-json` only as a fallback.
3. **For non-SDK TUIs (rare)**: Mode C appendix path.

The Type-A landscape is *adjacent prior art*, not the layer we're competing at. Worth studying for its convergent patterns (worktrees-as-isolation, session-id-as-resume, declarative backend config) and its divergent ones (no shared event schema, no shared backend-adapter contract). The ecosystem has converged on SDK-direct *for agent hosts* and on subprocess-stream-json *for agent routers* — silvery's bet is on the host side, with router-shape borrowing where useful.

## What we already have that nobody else has

- `@vterm/modern` — ANSI emulator (relevant only for Mode C fallback)
- `termless` + tty MCP — headless driver / testing shape
- `terminfo.dev` — capability database
- `mdtest` tape plugin — VHS .tape record/replay
- `silvery-selection` + ag-term — input pipeline
- `bearly/tribe` — multi-session coordination
- `bearly/recall` — session-history search
- `flexily` — tile/split layout
- Silvery components — richer UI primitives than any TUI or web agent host ships

## Meta-agent layer

One layer above the individual wrapped agents:

- **Consumes normalized streams** from N agent sessions simultaneously
- **Routes tasks** — "run this three ways in parallel" spawns three agent fibers under one worker legate
- **Bead-creates** work — drop into bd as tasks, assign to specific agent sessions
- **Coordinates via tribe** — chief election, cross-pane messages, shared state (see 07-sessions.md and 08-supervision.md)
- **Cross-agent memory** — recall-shape index over all agents' normalized events
- **Uplifts events** — permission prompts escalate to human; long-running calls trigger budget checks

Because we own the launcher, every agent session is a supervised actor under our tree. No guessing.

## Phases

| Phase | What | Effort |
|---|---|---|
| 1 | SDK integration for Claude; `<MessageList>` + tool-call rendering in silvery | ~1 week |
| 2 | `<TodoPanel>` + `<ActiveAgents>` + `<ActivityIndicator>` + `<StatusLine>` | ~1 week |
| 3 | `<PermissionDialog>` + `<ModeSwitcher>` + `<SlashPalette>` | ~1 week |
| 4 | Multi-agent harness — N fibers under one legate; tribe coordination; meta-agent skeleton | ~2 weeks |
| 5 | Vendor adapters for Codex / opencode / aider via CLI streaming when SDKs unavailable | ~1 week per vendor |
| 6 | .tape recording of live sessions → replay into tests, demos | Ongoing |
| Optional | Mode B JSONL tail for ambient memory / historical sessions | ~1 week when needed |
| Optional | Mode C PTY wrap for vendors without structured output | ~2 weeks when needed |

## Origin

2026-04-23 discussion starting from "how does Cline do it?" — the answer turned out to be: Cline doesn't wrap a terminal agent; it uses the Anthropic SDK directly. Same pattern we're committing to here, at silvery-harness scope.
