# Silvercode — the committed MVP

**Status**: committed direction (2026-04-24) after GPT-5.4 Pro review. The MVP for the AI-era terminal thesis.

**Naming**: **Silvercode**. Internal codename, decided 2026-04-24. **Keep this internal — do NOT publish on the public silvery site (`vendor/silvery/docs/`) or any external surface.** All design lives in `hub/silvercode/future/ai-terminal/`. Public name TBD when (if) we ship; for now everyone refers to it as Silvercode.

**The pitch in one sentence**: a local-first **agent workspace** that runs Claude Code (and later other agents) in structured mode by default, normalizes all activity into one session/event model, replays and searches everything, and gates risky actions with explicit policy.

**What it is NOT**: not a shell replacement, not a tmux replacement, not a public protocol, not an agent-authoring SDK. Those are in the [speculative ideas](#speculative-ideas-deferred-but-not-discarded) below — worth keeping, worth visiting later, not in scope now.

## Why this shape

Pro-review diagnosis was blunt: the original 6-track vision was "one platform thesis wearing six product costumes." The right MVP is a single focused product that proves the substrate's value via a daily-driver use case. Pro's recommendation: **agent workspace, not super-shell.** See [pro-review-2026-04-24.md](pro-review-2026-04-24.md).

Agreeing with pro + user alignment: **we're committing to this shape.**

## MVP scope (pro's spec, lightly expanded)

A silvery app where the user opens 2–4 concurrent Claude Code sessions and supervises them as peer work streams.

### Core features (expanded scope, 2026-04-24)

This is the "minimum viable product" expansion of the original "minimum viable architecture" spec. The goal: a silvery app that recognizably looks and behaves like Claude Code, plus the supervision/replay/memory layers Claude Code lacks. Items can spread across phases if hard; nothing here is dropped.

**1. Subprocess + stream-json spawn (Track 1 default)**

- Multiple Claude Code sessions concurrent, each riding the user's existing Pro/Max subscription via subprocess.
- Canonical spawn:

  ```
  claude --bare -p \
    --input-format stream-json \
    --output-format stream-json \
    --include-partial-messages \
    --verbose
  ```

  Not one-shot. `-p` is non-interactive (no REPL) but **with `--input-format stream-json` it opens a persistent bidirectional JSON channel** on stdin/stdout. Harness writes user/permission events to stdin; Claude streams turn-start, tool-use, tool-result, permission-request, turn-end events back. Equivalent to an interactive session with structured I/O. `--verbose` required for partial messages + tool events; `--include-partial-messages` for token streaming. `--bare` suppresses user's local hooks/plugins/MCP/skills for determinism (Anthropic indicated `--bare` will likely become the `-p` default).

  Resume/fork across invocations: `--resume <session-id>` or `-c`. One-shot calls drop the stream-json flags.

  `--input-format stream-json` is undocumented beyond the CLI flag table ([#24594](https://github.com/anthropics/claude-code/issues/24594)). `@silvery/agent-harness` owns the parser so the rest of the app never touches raw stream-json. Side-effect: ships the first standalone TS stream-json parser.

- Local transcript tail of `~/.claude/projects/<proj>/<session-id>.jsonl` in parallel for crash recovery + search.

**2. Claude Code-equivalent UI surface**

The full TUI shape Claude Code users already know. Built from silvery primitives + a few new components.

- **`<SessionCard>`** — one card per session; shows status, model, mode, token/cost counter
- **`<MessageList>`** — virtualized scrollback of the conversation
- **`<UserMessageBlock>` / `<AssistantBlock>`** — turn-level rendering with role indicators
- **`<ToolCallBlock>`** — tool invocation with input args
- **`<ToolResultBlock>`** — tool output, **click-to-expand/collapse** (using lifted `<Popover>` from km-logview)
- **`<TodoPanel>`** — TodoWrite tool's todo list (compact when collapsed, expanded when active)
- **`<ActiveAgents>`** — sub-agents currently running (Task tool spawns)
- **`<StatusLine>`** — model, cost, context window usage, mode, session ID
- **`<ContextDisplay>`** — what's currently in context (CLAUDE.md, MCP servers, skills loaded)
- **`<CommandInput>`** — the prompt input (silvery TextInput + slash-command palette + history)
- **`<HistoryDialog>`** — past sessions list, searchable
- **`<ModeSwitcher>`** — plan / accept-edits / auto / bypass
- **`<SlashCommandPalette>`** — `/compact`, `/clear`, `/agents`, `/mcp`, plus our additions: `/handoff`, `/inbox`, `/fork`
- **`<PermissionDialog>`** — approve/deny tool calls; shows diff for edits
- **`<NotificationToast>`** — peer-session events, permission requests landing in other sessions

**3. Multi-session supervision UI**

- Layout for 2–4 concurrent session cards; responsive (2-up at narrow widths, 4-up at wide)
- **`<PermissionInbox>`** — central queue of pending tool-approval prompts across all sessions; mouse+keyboard triage with diff previews
- **`<NotificationCenter>`** — aggregate alerts (peer messages, permissions, errors)
- Click a session card to focus; keyboard nav between sessions

**4. Auto-injected memory / channels / hooks** (the differentiator)

Every spawned session automatically gets, with no user config required:

- **`@km/mcp-server`** mounted — typed km tools (search, get_node, get_board, render_path, link). Read-only v1; gated mutations v2.
- **`@silvery/tribe-mcp`** mounted — typed tribe tools (`tribe_send`, `tribe_history`, `tribe_members`, `tribe_broadcast`). Sample MCP for "channels inside your sessions"; users can swap in their own. Tribe is the canonical example because we own it.
- **Channel-event injection** — when a peer session sends a tribe message addressed to this session, harness injects a `[channel from <peer>: <message>]` line into the next user-prompt turn (push, not pull, since events are turn-relevant).
- **UserPromptSubmit-equivalent injectors** (always-on, per-turn):
  - km active context (current bead, worktree, recent edits)
  - bd prime output (replaces user's SessionStart hook when running `--bare`)
  - tribe channel digest for new messages since last turn
  - silvery permission-inbox state (so the agent knows what's pending in peer sessions)
- All injection runs through the harness pipeline. Sample injectors ship in `@silvery/agent-harness`; users add custom injectors via config.

**5. Knowledge integration: bead + file + URL detection with popovers**

Every assistant message and tool output is scanned for recognizable references; matches become hoverable/clickable popovers.

- **Bead detection** — `bd-<scope>.<slug>` (or `bd:<id>`) → popover with bead title, status, recent activity, links. Backed by `bd show <id>`.
- **File path detection** — absolute and `~vault/...` style paths → popover with file tree position, recent edits, blame summary, optional preview
- **URL detection** — `https?://...` → popover with title + favicon + WebFetch summary on hover
- **km node references** (`#node-id` or `@-mention`) → popover with node title, body preview, parent breadcrumb
- **Code-fence references** (`see foo.ts:42`) → file:line popover
- **Popover** lifted to `@silvery/ag-react/Popover` (already implemented twice in km-logview + km-tui; consolidate)

**6. Markdown + code rendering**

Assistant output is markdown; we need to render it correctly, not show raw text.

- **Markdown renderer** — `@silvery/markdown` package: parses common markdown (tables, lists, headings, inline code, links, blockquotes, code fences) → silvery components. Built on `mdast` parser. Renders to silvery's existing `Table`, `Text`, `Box` primitives.
- **Code syntax highlighter** — Shiki-based, with bundled grammars for the top languages users actually paste (TS/JS/Python/Bash/JSON/MD/YAML/Rust/Go/SQL). Theme tokens map to silvery's `$tokens` so it inherits theme. ~1 week including silvery wrapper.
- **Diff renderer** — for Edit tool inputs (before/after), with color and gutter

**7. Replay, search, handoff**

- Tape recording via mdtest `.tape` format — every session is a recording
- FTS5 search across all prior session transcripts (recall-shape)
- Handoff action — move task+context from session A to B; km-node references travel with the handoff

**8. Responsive design**

- Layout breakpoints by terminal width:
  - <80 cols: single session card, side panels collapsed
  - 80–140: 2-up cards, side panels overlay
  - >140: 4-up cards, side panels persistent
- Popovers anchor relative to source, reposition to stay on screen
- Touch-friendly hit targets even though this is a terminal (mouse hover/click is first-class per silvery's positioning)

### Explicitly NOT in MVP

- PTY wrapping (we don't embed a shell; users run shells in their own terminal)
- Full multiplex (no panes/splits/tabs for arbitrary processes; silvery layout handles the session cards)
- CAP protocol (internal only if at all; not a public standard)
- Commander / super-shell / shell replacement
- Stdlog / stdapi FD conventions (12-factor++ is a future idea)
- Supervision tree spanning local-to-cloud
- Agent authoring (only wrapping existing agents)
- km **write** operations from agents in v1 (read-only MCP first; gated mutation tools in v2 once the permission inbox proves reliable)
- 100% markdown spec coverage in v1 (top ~80% of features; rare edge cases can wait)
- Themes beyond silvery's defaults (use what we have)

## Stack

```
Silvery UI components       (MessageList, ToolCallBlock, TodoPanel, ActiveAgents,
                             StatusLine, PermissionDialog, ModeSwitcher, SessionCard,
                             PermissionInbox, HandoffDialog)
        ↑
Canonical event log         (append-only; FTS5; replay; see "missing atoms" below)
        ↑
Session store               (tracks N active agent sessions + lifecycle state)
        ↑
@silvery/agent-harness      (one interface, two adapters)
   ├── Track 1 adapter: spawn `claude --bare -p` (subprocess + stream-json)  ← default
   └── Track 2 adapter: @anthropic-ai/claude-agent-sdk (in-process, API key) ← power-user
        ↑
        ├── (Track 1)  Claude Code CLI binary  →  Anthropic API (via Pro/Max OAuth)
        └── (Track 2)  Anthropic API           (via API key, per-token billing)

In parallel: @km/mcp-server (stdio MCP) — every session loads it via .claude/settings.json
             Tools: km_search, km_get_node, km_get_board, km_render_path, km_link
             Resources: km://board/<vault>, km://node/<id>
```

Supporting layers already exist in our stack:

- `silvery` + `silvery-selection` + `flexily` — UI rendering, layout, input
- `mdtest` tape plugin — .tape record/replay
- `bearly/tribe` — cross-session coordination (if user opens multiple workspaces or shares with teammate)
- `bearly/recall` — search over session history (already indexes Claude Code JSONL)
- `alien-*` — reactive state for session/block/tree views
- `@km/storage` + `@km/board` — backing graph + board logic for the MCP server

## What's actually missing for MVP

Three atoms, none of them PTY:

### 1. `@silvery/agent-harness` — subprocess + stream-json + SDK adapter

TypeScript package. One interface; two adapters behind it.

- **Track 1 adapter** (default): spawns `claude --bare -p --input-format stream-json --output-format stream-json --include-partial-messages --verbose`, parses the stream-json event protocol on stdout, writes user/permission events to stdin. Tails `~/.claude/projects/<proj>/<session-id>.jsonl` in parallel for crash recovery + search.
- **Track 2 adapter** (power-user): wraps `@anthropic-ai/claude-agent-sdk` for in-process execution. API-key billing.

Both adapters expose the same typed surface:

- Typed event stream (turn-start, tool-use, tool-result, permission-request, turn-end, session-end)
- Input channel (feed user messages, respond to permission prompts)
- **Context-injection pipeline** — harness-level UserPromptSubmit equivalent. Every user message is passed through a chain of injectors before being written to Claude's stdin. First-party injectors: km context (active bead, worktree, recent activity), cross-session state (permission-inbox summary, what peer sessions are doing), bd prime (replaces the user's bd SessionStart hook when running `--bare`). User-defined injectors plug in via config. Runs deterministically regardless of `--bare` vs non-bare.
- Policy gate (intercept tool calls, route to permission inbox when plan mode)
- Session lifecycle (spawn, pause, resume, fork, kill)

**Why `--bare` creates a context-injection design question.** `--bare` suppresses the user's `.claude/settings.json` hooks/plugins/MCP/skills for determinism — which means their own `SessionStart`, `UserPromptSubmit`, and `PreCompact` hooks don't fire inside the subprocess. For km users this specifically breaks `bd prime` (their SessionStart injection). The harness resolves this by making bd prime a first-party injector, not a user-hook replacement. General pattern: **if a user's hook was doing context injection, the harness owns it; if it was doing enforcement (like `silvery-read-gate`), that stays in the user's hooks and we run non-bare.** Per-session config picks which mode.

Side-effect: ships the **first standalone TypeScript stream-json parser** (currently an open ecosystem gap — [awesome-claude-code #1046](https://github.com/hesreallyhim/awesome-claude-code/issues/1046)). Consider publishing the parser as its own package (`@silvery/claude-stream-json`).

Effort: ~2 weeks for Track 1 (the subprocess + parser is the novel work); +3–4 days for Track 2 adapter on top.

### 2. Canonical event log / session store

Pro's second missing atom. A unified event envelope that can absorb:

- Claude's JSONL messages and tool events (from both harness tracks)
- Silvery UI interactions (permission approvals, mode switches, handoffs)
- Tribe messages between sessions
- MCP tool calls (km + others) with provenance
- Tape replay markers

Without this, we end up with multiple incompatible data planes. With it, replay, search, and audit all work uniformly.

Schema sketch:

```typescript
type SessionEvent =
  | { kind: 'turn-start', role: 'user' | 'assistant', ts: number }
  | { kind: 'turn-end', ts: number, usage: TokenCounts }
  | { kind: 'tool-use', name: string, input: unknown, id: string, mcp_server?: string, ts: number }
  | { kind: 'tool-result', id: string, output: unknown, ts: number }
  | { kind: 'permission-request', tool: string, args: unknown, ts: number }
  | { kind: 'permission-decision', request_id: string, approved: boolean, ts: number }
  | { kind: 'handoff', from: SessionId, to: SessionId, context: unknown, ts: number }
  | { kind: 'session-lifecycle', session: SessionId, state: 'started' | 'paused' | 'resumed' | 'ended', ts: number }
  | { kind: 'km-reference', node_id: string, relation: 'context' | 'decision' | 'output', ts: number }
```

All persisted to an append-only log per session (SQLite or flat JSONL); queryable by recall-shape FTS5; replayable by tape-plugin.

Effort: ~1 week for schema + store + writers + readers. Silvery components bind to queries.

### 3. `@km/mcp-server` — km as persistent memory for every session

Stdio MCP server exposing km operations as typed tools. Registered in `.claude/settings.json` so every Claude Code session spawned by the harness gets km-as-memory automatically.

v1 tool surface (read-only):

- `km_search(query, vault?, limit?)` — FTS5 over nodes + bodies
- `km_get_node(id, include_children?, include_body?)` — single node with selectable depth
- `km_get_board(vault?)` — current board as structured JSON (columns + cards + counts)
- `km_render_path(id)` — breadcrumb trail for a node (for context framing)
- Resources: `km://board/<vault>`, `km://node/<id>` — cachable context blobs the model can pull without a tool call

v2 (post-MVP, gated behind permission inbox):

- `km_create_node(parent, title, body?)`, `km_move_card(id, to_column, position?)`, `km_link(from, to, rel)`, `km_archive(id)`

Effort: ~1 week for v1 (reads are straightforward over `@km/storage`); v2 is pure extension once the permission inbox lands.

Why this is in MVP, not deferred: **it's the single biggest differentiator** against claude-flow / Gas Town / Agent Teams. Those tools have opaque text memory; Silvercode sessions have a bidirectionally-synced knowledge graph. Removing this feature drops us into a crowded field; keeping it is category-defining.

## Phased delivery — small steps, working software at every milestone

**Principle**: ship something usable end-to-end as fast as possible, then layer. Every milestone produces a runnable Silvercode that does *something* a human can sit down and use. Total estimated ~13 weeks split into ~weekly milestones; nothing is "and then we test it for 3 weeks."

### MVA — Minimum Viable Architecture (the "it works" milestone)

The smallest possible end-to-end thing. Nothing pretty. Proves the spawn + parse + render loop works at all.

**M0 — Spawn + render (1 week)**
- `@silvery/agent-harness` skeleton: spawn `claude --bare -p --input-format stream-json --output-format stream-json --include-partial-messages --verbose`, parse the event stream, emit typed events to a callback.
- Trivial silvery app: one `<SessionCard>`, renders `<MessageList>` of user/assistant turns and unstyled `<ToolCallBlock>` / `<ToolResultBlock>` (just JSON.stringify the output for now).
- One `<TextInput>` at the bottom for user prompts; submit writes to the harness stdin.
- Dogfood: open Silvercode, type a prompt, see Claude respond with tool calls scrolling by. **This is "it works."**

### MVP — Minimum Viable Product (daily-driver-able)

Layered onto MVA. Each milestone independently shippable; each is a testable, dogfoodable improvement.

**M1 — Tool blocks + Popover (1 week)**
- Lift `<Popover>` from km-logview → `@silvery/ag-react/Popover`
- Click-to-expand `<ToolCallBlock>` and `<ToolResultBlock>` showing full args/output
- `<TodoPanel>` rendering TodoWrite state
- `<StatusLine>` with model, cost, mode, session ID

**M2 — km MCP attached (1 week)**
- `@km/mcp-server` v1 (read-only: search, get_node, get_board, render_path)
- Wire to `.claude/settings.json` (or `CLAUDE_CONFIG_DIR` per-session) so the spawned session sees the MCP
- Dogfood: ask Claude "what's in km bead km-silvery.silvercode" — tool call hits the MCP, result renders inline

**M3 — Auto-injection pipeline (1 week)**
- Harness injection-pipeline plumbing: registry of injectors, per-turn invocation, append `additionalContext` to user-message events before stdin write
- Sample injectors: km active context (current bead, worktree), bd prime equivalent
- Dogfood: every session knows what bead it's on without the user having to say

**M4 — Tribe MCP + channel injection (1 week)**
- `@silvery/tribe-mcp` v1 (send/receive/history via existing tribe daemon)
- Tribe-as-session-name auto-join (session name = tribe identity)
- Channel-event injector — when a peer session sends a tribe message addressed to this session, inject `[channel from <peer>: <msg>]` into next user-prompt
- Dogfood: two Silvercode sessions, send a tribe message between them, see it land in the recipient's context on the next turn

**M5 — Multi-session layout (1 week)**
- 2-up grid of session cards
- Click a session to focus; keyboard nav between sessions
- Each session has its own harness + tribe identity + km MCP

**M6 — Permission inbox (1 week)**
- `<PermissionInbox>` aggregating tool-approval requests across sessions
- Diff preview for Edit tool inputs
- Approve/deny with mouse or keyboard
- `<ModeSwitcher>` (plan / accept-edits / auto)

**M7 — Markdown rendering (1 week)**
- `@silvery/markdown` package: mdast parser → silvery components (tables via existing Table, lists, headings, code fences, blockquotes, inline)
- Code fences route to placeholder for syntax (next milestone)

**M8 — Code syntax + diff (1 week)**
- `@silvery/syntax` package: Shiki-based, bundled grammars for top-10 languages, themed via `$tokens`
- Diff renderer for Edit tool inputs (before/after with color + gutter)

**M9 — Bead + file + URL detection popovers (1.5 weeks)**
- Auto-scanner over assistant text + tool outputs for bead IDs, file paths, URLs, km node refs, code-fence file:line refs
- Popover content per detection type: `bd show`, file tree position + recent edits, WebFetch preview, km node summary

**M10 — Replay + search + handoff (2 weeks)**
- Tape recording via mdtest
- FTS5 recall index over session JSONLs + canonical event log
- `<HistoryDialog>` — searchable past-sessions list with deep-link to replay
- Handoff action: move task+context+km-references from session A to B
- Worktree-aware session cards (git state, branch, dirty/uncommitted)

**M11 — Track 2 (SDK adapter) (1 week)**
- `@silvery/agent-harness` Track 2 adapter wrapping `@anthropic-ai/claude-agent-sdk`
- Behind the same interface as Track 1
- Dogfood: same UI, one session on Track 1 (subscription) + one on Track 2 (API key)

**M12 — Codex backend (2 weeks)**
- Codex Track 1 (spawn `codex` CLI; map events to canonical schema)
- Codex Track 2 (Codex SDK)
- Cross-vendor handoff (hand a task from Claude to Codex via the same handoff verb)

**MVP ship after M12.** Total: ~13–14 weeks.

### Post-MVP differentiating features (not in MVA, target ~M13–M16)

**Account switching** — promoted from "polish" to "differentiator." Important enough to call out up front, but **not required for MVA / first ship**. The pain is real (Anthropic's tightening rate limits, users juggling 2–4 accounts manually) and nobody else has solved it: Cursor/Cline/opencode are API-key-only and structurally can't; Claude Code itself doesn't offer it. Silvercode is uniquely positioned. Worth shipping right after MVP as the v1.1 headline feature. See "Multi-account support" below for surface design.

**Other post-MVP**:
- Theming + customization
- `@km/mcp-server` v2 gated mutation tools (create_node, move_card, link, archive)
- Plugin marketplace integration (consume Anthropic's; ship `@km/claude-plugin` to it)
- Mobile companion via silvery's web target
- Cross-product session views (PIM agents alongside coding sessions)
- Account exhaustion failover, auto-routing heuristics, shared-pool view (the deep cuts of multi-account)

### Why this phasing works

- **M0 unblocks everything.** As soon as M0 lands, every subsequent milestone is layered onto a working app you can use.
- **Each milestone is independently demoable.** No "we're refactoring for 3 weeks before you see anything new."
- **Hard items are isolated.** Markdown (M7), syntax (M8), popover scanner (M9), Track 2 (M11), Codex (M12) are each standalone units — slip one without delaying others.
- **Differentiators land early.** km MCP (M2) and auto-inject (M3) ship in week 4 — before any of the polish work. If they don't deliver the wedge we expect, we know early and pivot.

## Validating (business case gate)

We have NOT answered: who needs this? Would they pay? Would they switch from Claude Code's native TUI?

The product thesis only holds if:

- Multi-session Claude Code work is common enough that aggregated permission inbox + handoff is valuable (vs. 4 separate terminal windows)
- Replay+search across sessions has enough pull to justify switching from CC's native TUI
- Silvery's rendering is notably better than CC's TUI — enough for users to tolerate one more tool in their stack

These are **user-research questions** that should inform whether to push past Phase 1. Running a Phase 0 + Phase 1 dogfood internally is cheap enough to be worth doing regardless.

## Speculative ideas (deferred, but not discarded)

Everything in the original brainstorm that isn't in MVP scope stays in this folder as speculative. Worth keeping — may pull on later if MVP succeeds:

- **[03-agent-authoring.md](03-agent-authoring.md)** — building our own agent products (silvery-coder, silvery-team, silvery-pair, silvery-agent-kit). Only after workstation proves daily value.
- **[04-multiplex.md](04-multiplex.md)** — tmux-shape primitives as components (PTY panes, splits, tabs). Needed only if we ever want to embed shells in the workspace.
- **[05-cap-protocol.md](05-cap-protocol.md)** — typed protocol for CLI tools. Pro: "treat as internal manifest IR, not public protocol." Defer.
- **[06-commander.md](06-commander.md)** — super-shell with tmux built in. Pro: "this is the scope graveyard." Defer indefinitely.
- **[07-sessions.md](07-sessions.md)** — typed job control with `tee A B`, `link A B`, `compose` verbs. MVP only needs "handoff"; the rest is speculative.
- **[08-supervision.md](08-supervision.md)** — unified supervision tree (legion-scope), stdlog/stdapi on fd3/fd4, structured concurrency everywhere, 12-factor++. The deepest idea; also the riskiest. Defer.
- **AI-native shell** (a commander specialization) — genuinely interesting but unproven useful. High experimental risk.

**Rule**: speculative ideas stay here as reading; they don't become roadmap unless MVP proof justifies them.

## What the remaining docs are for, now

| Doc | Status | Relevance to MVP |
|---|---|---|
| [01-building-blocks.md](01-building-blocks.md) | Active | Stack inventory. PTY no longer critical-path — the missing atoms for MVP are the SDK wrapper + canonical event log. |
| [02-agent-integration.md](02-agent-integration.md) | Active | Agent harness design. Feature-parity matrix. Industry comparison. The primary design doc for the MVP's core integration. |
| [03-agent-authoring.md](03-agent-authoring.md) | **Speculative** | Building our own agent-host products. Post-MVP. |
| [04-multiplex.md](04-multiplex.md) | **Speculative** | tmux components. Not needed unless we embed shells. |
| [05-cap-protocol.md](05-cap-protocol.md) | **Speculative** | Public protocol design. Keep as internal IR idea only. |
| [06-commander.md](06-commander.md) | **Speculative** | Super-shell. Scope trap per pro. |
| [07-sessions.md](07-sessions.md) | Partial | Handoff is MVP; the extended verbs (tee/link/compose) are speculative. |
| [08-supervision.md](08-supervision.md) | **Speculative** | Legion-scope supervision + stdlog/stdapi. Deep future idea. |
| [09-agent-host-landscape.md](09-agent-host-landscape.md) | Active | Competitive intelligence. Informs positioning. |
| [big-ideas.md](big-ideas.md) | Mixed | /big lens additions; many are MVP-relevant (permissions, observability, accessibility); some are speculative. |
| [feasibility.md](feasibility.md) | Active | Blockers + sequencing. Needs update for the simpler MVP path. |
| [pro-review-2026-04-24.md](pro-review-2026-04-24.md) | Reference | GPT-5.4 Pro's full review. The basis for this reshape. |

## The billing / auth reality (2026-04-24 update)

**Important correction to the SDK-first decision below.** Anthropic's January 2026 enforcement (clarified in ToS Feb 19, 2026; full cutoff April 4, 2026) makes subscription OAuth tokens (Pro / Max) unusable outside the official Claude Code product. The Agent SDK explicitly requires an API key. This creates a hard fork in the architecture:

| Auth path | Billing | Tooling options | Who it's for |
|---|---|---|---|
| **Subscription OAuth (Pro / Max)** | Flat $20 / $100 / $200 per month | **Official Claude Code CLI only** (`claude --bare -p --output-format stream-json`). Plus Anthropic's own VS Code extension, which IS Claude Code under the hood. | Users who already pay for Pro/Max and want to leverage that quota |
| **API key** | Per-token, ~$13/dev/active-day for typical CC workloads | Claude Agent SDK, third-party tools (Cline, Continue, aider, opencode, etc.) | Users willing to pay API rates for more flexibility |

Equivalent fork exists for OpenAI:

- **Subscription**: ChatGPT Plus / Pro / Business → **official Codex CLI / app / IDE extension only** (uses ChatGPT login). April 2, 2026 OpenAI moved Codex to API-token billing for subscription users too — same shape, different packaging.
- **API key**: Codex SDK, MCP server, app server, third-party tools.

**Concrete rules that bind Silvercode**

- Using OAuth tokens from Pro / Max **directly** (header replay against the API from a custom client) in Silvercode would be a ToS violation, server-side-enforced since 2026-01-09. Don't go there.
- Agent SDK is API-key-only. A user must provision an Anthropic API key to use SDK-direct integration.
- **Spawning the official `claude` binary as a subprocess is sanctioned.** Boris Cherny (Anthropic Claude Code lead) said publicly on X (~April 11, 2026) that CLI-style usage including `claude -p` is allowed. OpenClaw updated its docs to treat this as approved usage. Caveat: **no formal blog post or ToS update.** Policy could shift; design accordingly (clean abstraction at the harness boundary so we can swap auth modes without rewriting the workspace).
- Anthropic has stated `--bare` will likely become the default for `-p`. Use it now to future-proof.

**Prior art — two established subprocess patterns**

The field has converged on two shapes for talking to Claude Code via subprocess. Silvercode is in the second camp.

*Pattern A — interactive-in-pane* (REPL per tmux pane; human-or-coordinator types; output is ANSI grid)

- **Steve Yegge's Gas Town** (Jan 1, 2026 launch) — orchestrates 20–30 parallel Claude Code agents using tmux. Each agent is a Claude Code REPL in its own tmux pane. Roles: Mayor (coordinator), Polecats (ephemeral workers), Refinery (merge queue), Witness/Deacon/Dogs, Overseer (human). State in Beads (same issue tracker we use) + git. Direct precedent for the "supervise N Claude Code sessions" wedge; the closest thing to Silvercode shipping today. Opaque to automation (no structured events).
- **Anthropic's own Agent Teams** (`code.claude.com/docs/en/agent-teams`) — opens each teammate in its own tmux or iTerm2 split pane. Blessed by Anthropic, confirms the pattern is officially OK.
- **agent-of-empires** (njbrake) — multi-agent fleet manager, tmux + git worktrees, supports Claude Code / opencode / Codex CLI / Gemini CLI / pi.dev / Copilot CLI / Factory Droid. Validates the "wrap any agent CLI" thesis from `02-agent-integration.md`.

*Pattern B — stream-json bidirectional* (subprocess + `--input-format stream-json` + `--output-format stream-json`; structured events; programmable)

- **OpenClaw (post-April 2026)** — explicitly migrated from its old `anthropic/` API backend to a `claude-cli/` backend that shells out to the Claude Code CLI specifically to leverage Pro/Max subscription quota. This migration is what Anthropic informally sanctioned in the April 11 Boris-on-X clarification. OpenClaw is now the reference implementation for "third-party harness using subscription via subprocess spawn."
- **ruvnet/claude-flow** — built around "Stream-JSON Chaining." Core primitive: pipe one `claude -p --output-format stream-json` into another `claude -p --input-format stream-json`. Multi-agent pipelines via Unix pipes on typed events.
- **stellarlinkco/myclaude** — multi-agent orchestration across Claude Code + Codex + Gemini + opencode using the same spawn pattern.
- **Stanford iris-lab meta-harness** — research Claude Wrapper using stream-json subprocess.
- **Background Claude community (backgroundclaude.com)** — documenting the pattern; explicitly frames stream-json as "the output format that changes everything" because it turns `claude` into a programmable backend.
- **littlebearapps/untether-claude-skills** — skill package encapsulating the pattern.

*What Pattern B is still missing* — and where Silvercode differentiates

- **No standalone stream-json parser in TypeScript.** The Anthropic SDK couples parsing with subprocess management. A proposed `claude-code-parser` package ([hesreallyhim/awesome-claude-code #1046](https://github.com/hesreallyhim/awesome-claude-code/issues/1046)) is an open issue, not a shipped library. `@silvery/agent-harness` should ship this as a side-effect of its own needs.
- **Pipeline-oriented, not supervision-oriented.** claude-flow and myclaude do "pipe task A → task B" chains. Nobody is doing "supervise 2–4 concurrent long-running sessions with aggregated permission inbox + handoff." That's still the Silvercode wedge.
- **CLI-only, no rich UI.** Stream-json tools today are Unix-pipe plumbing. Nobody renders the event stream as a silvery session card with diff preview, mouse-triageable permissions, or a live tool-use timeline.
- **No canonical event log.** Tools consume stream-json transiently and move on. Nobody persists a unified schema across sessions + replay + search. Pro called this out as the "second missing atom."

The pattern is established. The auth path is (informally) sanctioned. The existence proof is shipping. **Our contribution is the supervision UI layer + canonical event log + replay — none of which the stream-json ecosystem is building yet.**

## Multi-account support — differentiator, target M13/v1.1 (post-MVA, post-MVP)

**Status (2026-04-24)**: not in MVA, not in MVP first ship, but the **most important post-MVP differentiator** and worth landing as v1.1 headline feature.

The pain is real and growing as Anthropic's rate limits tighten:

- A Max $200 user burns 5-hour quota in <20 minutes during peak hours (Anthropic admitted this March 2026)
- Heavy users routinely hold 2–4 separate Anthropic accounts (personal Pro, work Max, experimental project, family member's Max) and rotate manually
- Today's solution is shell aliases: `alias cwork=CLAUDE_CONFIG_DIR=$HOME/.claude-batman claude` ([Jacques on X](https://x.com/JacquesThibs/status/1946412707995140347))
- **Nobody has automated this.** Cursor/Cline/opencode can't (API-key-only). Claude Code itself doesn't offer it. Silvercode is uniquely positioned because we own the spawn boundary

What we ship at v1.1:

- **Per-session account binding** — each session card declares which Anthropic account to use; harness sets `CLAUDE_CONFIG_DIR=<per-account-config-dir>` before spawn so each session uses isolated credentials/history
- **Account roster UI** — manage configured accounts (add new = OAuth flow inside Silvercode, no shell aliases needed); see remaining 5-hour + weekly quota per account at a glance
- **Account switcher dropdown** on every session card — switch mid-task; current turn finishes on original account, future turns go to the new one
- **Quota-aware spawn** — when starting a new session, harness picks the account with the most remaining quota
- **Auto-account routing heuristics** (v1.2): match worktree's `git config user.email` to account; per-vault default; per-bead override
- **Account exhaustion failover** (v1.2): when active account hits limit mid-session, optionally auto-fail-over to next-available with user confirmation
- **Family / shared-pool support** (v1.3): Max plans technically allow N seats; surface this as a "shared pool" view if multiple seats belong to the user's household

Track 1 only (subscription auth is the whole point). Track 2 (API key) gets a parallel "multi-key" feature for users with multiple billing accounts (personal vs employer-paid) — same shape, different mechanism.

**Why it's not in MVA**: account switching is value-add over a working baseline. Until we have one Claude Code session running through Silvercode end-to-end (M0), there's nothing to switch *between*. Add it once the core spawn-render-injection loop is solid.

**Why we call it out now**: it's the v1.1 landing-page feature. "Plug Silvercode in, your four Anthropic accounts show up, you get 4× effective quota with zero ceremony" is a complete one-sentence pitch. Cursor can't say this. Cline can't say this. Claude Code itself can't say this. Worth designing toward from M0 (don't paint ourselves into a single-account corner) even though we don't ship it until v1.1.

## Tribe-session naming

When Silvercode spawns a Claude Code session, it auto-joins tribe with the **session name as the tribe identity**. Side effects:

- Sessions are addressable from peer sessions: `tribe.send(to="refactor-storage-v5", message="status?")`
- Cross-session coordination uses the existing tribe primitives unchanged
- Channel events are routed by session name, not opaque session IDs
- `@silvery/tribe-mcp` exposed inside each session uses the same name; the agent inside knows what session it is and who its peers are
- Naming convention: `<task-slug>` for ad-hoc, `<bead-id>` for bead-tracked work, `<vault>:<task>` for cross-vault

This is a small touch but it makes multi-session work coherent. Without it, sessions are anonymous; with it, they're peer participants in a tribe with persistent identities. Mirrors the Gas Town role-naming (Mayor, Polecats, Refinery) but session-driven instead of role-fixed.

## Rendering substrate — try both silvery rendering modes

Silvercode is rendered through silvery throughout — this is **not** about embedding a third-party vterm package. It's about which of silvery's own rendering modes we use for the main session view.

### Option A — Dynamic scrollback (silvery's default mode)

Render through silvery's standard ag-term reconciler into the host terminal's real scrollback. SSH-transparent, mouse-friendly, works in Ghostty / iTerm / Kitty / Alacritty / etc. without alt-screen takeover. Silvery's published positioning is "rich UI in scrollback, not Warp's alt-screen-always trap."

**Pros**: native to silvery; survives SSH; preserves user's terminal scrollback; no alt-screen flicker; output stays selectable / copyable in the host terminal; future-proofs the silvery web-target story (DOM / canvas rendering parallels scrollback semantics more naturally than alt-screen).
**Cons**: layout is constrained by what the host terminal exposes per frame; floating overlays / popovers have to render as inline disclosure regions or temporary blocks rather than true overlays; resize behavior depends on the host's reflow; multi-pane has to be expressed in flexily, not via overlapping windows.

### Option B — Altinline (silvery's virtual-terminal mode)

Silvery's altinline mode — silvery owns the full render surface within a defined region (alt-screen-style, but inline rather than full-window). We get a stable grid we fully control: floating overlays, popover positioning, multi-pane layouts with hard boundaries, predictable resize.

**Pros**: full layout control inside the region — true floating popovers, overlapping panels, deterministic positioning; better for the dense multi-session UI (4-up cards with permission inbox + status line all visible at once); animation-friendly (no host-terminal jank).
**Cons**: gives up some scrollback transparency (the altinline region is its own world); host terminal selection / copy interacts differently; SSH still works but the interaction model is more opinionated; if user wants to scroll back through Silvercode's history they need silvery's own scroll, not the host's.

### Decision (2026-04-24): try both, no premature lock-in

- **M0 spike**: build the first end-to-end session in scrollback mode (Option A). Get a working `<SessionCard>` with `<MessageList>` rendering stream-json events.
- **M1 second spike (parallel or right after)**: take the same SessionCard + MessageList components and re-host them inside silvery's altinline mode (Option B). Same components, different rendering substrate.
- **Compare on the things Claude Code sets the bar on**: markdown tables, code blocks, click-to-expand popovers, resize behavior, multi-session layout, mouse interaction, scrollback-from-host vs scrollback-internal.
- **Decide empirically by M2 / M3**: which mode is the default for the main session view. The other stays available — modes can be per-session-card, per-window, or user preference.
- **Both options stay silvery-native end to end.** Same components render in both. The choice is which silvery render mode wraps them.

A `<TerminalEmbed>` for genuinely terminal-shaped subprocess output (vim, htop, less inside an agent's Bash call) sits at a different layer entirely — that's the speculative `04-multiplex.md` territory, not in MVA scope. We're not deciding it here.

## Two-track integration — decision summary

Both tracks ship; users pick per session based on auth/billing posture. `@silvery/agent-harness` abstracts them behind one event/input interface so the rest of the app never knows which is active.

- **Track 1 (default, subscription-safe)**: subprocess spawn of `claude --bare -p --input-format stream-json --output-format stream-json --include-partial-messages --verbose` + JSONL tail. Rides Pro / Max quota. Informally sanctioned by Anthropic (Boris Cherny on X, April 11 2026). Zero additional cost for existing subscribers. Ships first in Phase 0.
- **Track 2 (power-user / team, API-key billing)**: `@anthropic-ai/claude-agent-sdk` in-process. Typed permission callbacks, finer tool control, cleaner lifecycle. Per-token billing. Ships in Phase 1 on top of the same canonical event log.

Same pattern for OpenAI (Phase 3): official `codex` CLI subprocess for Plus/Pro/Business subscribers; Codex SDK for API-key users.

Teams likely want Track 2 (governance, auditable API-key spend). Indies likely want Track 1 (leverage existing Max subscription). Both get the same silvery UI, same event log, same km-as-memory, same replay.

## Related projects — in the ecosystem vs outside it

Worth distinguishing: **sibling products we own** (openclaw, pam, kimmi, cloudi) can eventually share substrate with Silvercode. **Competitive peers** (opencode, Cline, Cursor, Claude Code) are not integration targets — we study them, we don't embed them.

### Competitive peers (don't integrate, learn from)

- **opencode / Cline / Cursor / Claude Code / aider / Continue** — other agent hosts. They each have their own agent loop, their own UI, their own niche.
- **Don't wrap them by default.** Silvercode is itself an agent host competing in the same space; wrapping a competitor would be scope-creep and an admission that their UX beats ours somewhere. Study their design, borrow patterns, but don't embed binaries.
- **Wrap case-by-case only** if a concrete user need emerges ("I want opencode's LSP-aware navigation inside Silvercode"). Then: Mode A (non-interactive stream if they have one), Mode B (session-file tail), Mode C (PTY) as last resort. See 02 for the harness patterns.

### Sibling products (share substrate, post-MVP)

The Silvercode is scoped to coding agents, but the same substrate naturally extends to the user's other personal-AI projects. None of these are in MVP scope, but it's worth noting how they'd integrate:

- **openclaw** (`Code/openclaw/`) — multi-channel personal AI assistant (WhatsApp / Slack / email) that's pam's predecessor. Uses Claude as the backing model, runs persistent agent sessions for personal tasks.
- **pam** (`Code/pim/pam/`) — successor to openclaw with CRDT sandboxing via Automerge. Multi-channel personal AI with durable state.
- **kimmi** (`Code/pim/kimmi/`) — PIM with CRDT sync (contacts, calendar, notes).
- **cloudi** (`Code/pim/cloudi/`) — Claude AI chat CLI + autonomous mail bot.

### Natural integration points (post-MVP)

If Silvercode succeeds as a coding-agent workdesk, these adjacent projects become candidates for the same substrate:

1. **Shared `@silvery/agent-harness`** — coding sessions in Silvercode and PIM-assistant sessions in openclaw/pam can both run on the same two-track harness (subprocess Track 1 or SDK Track 2). Different agents, same plumbing.
2. **Shared canonical event log** — one unified schema for agent events (turn-start, tool-use, permission-request, handoff, km-reference) works for coding and for PIM. Same replay format, same search index.
3. **Shared `@km/mcp-server`** — the same MCP server is mounted in PIM agents too. Coding agents draw from km for project context; PIM agents (openclaw/pam) draw from km for personal context (people, decisions, calendar). Same store, same tool surface, different vault roots per agent persona.
4. **Cross-product workspace views** — a future unified "all my agents" view could show coding sessions (Silvercode) alongside PIM sessions (openclaw/pam) in the same silvery UI. Same session cards, different agent types, one dashboard.
5. **Tribe coordination across products** — coding agents can notify PIM agents ("I'm blocked, ping me in 2 hours" → openclaw schedules it) and vice versa, via the tribe bus.

### Why it's NOT in MVP

- Each of openclaw, pam, kimmi, cloudi has its own product scope, user set, and timeline. Pulling them into Silvercode MVP scope sprawls things back to the original 6-track problem.
- The MVP needs to prove the coding-agent use case first. If it works, the same substrate naturally generalizes.
- These projects have their own heritage (openclaw's channels, pam's CRDT sandboxing) — Silvercode shouldn't dictate their architecture until there's a real use case.

### The clean framing

Think of Silvercode as the **reference implementation** of "silvery-native agent host." If the pattern works, openclaw/pam can adopt the same components later — same harness, same event log, same km-as-memory, different agents on top. Not a merger; a family of products sharing a substrate.

This is the "one platform, many surfaces" story pro warned us about overselling — but it's legitimate when we have multiple in-house products that already exist and could benefit.

## Naming — resolved (internal)

**Silvercode** — decided 2026-04-24. Internal codename only. Do not promote to public docs, public silvery site, marketing materials, GitHub repo names, or anything externally visible until we explicitly decide to ship publicly.

Public name (if/when shipped) is a separate decision and not in scope until Phase 3.
