# Cline Kanban vs km — Strategic Analysis

Cline Kanban — shipped as the **independent open-source `kanban` npm package** (`cline/kanban` on GitHub, Apache-2.0, 711 ⭐, actively developed) — is the first shipped product in the "kanban-for-coding-agents" space. It overlaps heavily with km's product shape. This matters.

General reference: [coding-agents/cline.md](../../../../../Bear/Journal/ref/coding-agents/cline.md).

## Corrected framing (2026-04-22)

The npm package `kanban` is **a separate open-source release**, not a feature bundled inside Cline. It has:

- Its own repo (`cline/kanban`), README, CHANGELOG, CONTRIBUTING, RELEASE_WORKFLOW
- Apache-2.0 license
- 711 ⭐, 165 forks, pushed today
- `bin: kanban` — runs standalone, no Cline dependency at runtime
- An Electron desktop wrapper in `packages/desktop`
- Its own web UI (`web-ui/`) using tRPC + React
- Agent runtime abstraction: supports **Claude, Codex, Gemini, OpenCode** as interchangeable runtimes

Cline is one installer of it, but `kanban` is clearly positioned as shared infrastructure for the coding-agent ecosystem. Think "Kubernetes of coding agents" ambition.

## Shape overlap

| Feature | Cline Kanban | km |
|---|---|---|
| Kanban board as primary UI | ✅ | ✅ |
| Parallel agents via git worktrees | ✅ | ✅ (`bun worktree`) |
| Task tracking / dependencies | ✅ (⌘+click linking) | ✅ (beads with deps) |
| Diff viewer | ✅ (checkpoint-scoped + inline comments) | ❌ (not yet) |
| Auto-commit + Auto-PR | ✅ | ❌ |
| Multi-agent runtime (Cline/Claude Code/Codex/OpenCode) | ✅ | ❌ (km is its own app) |
| Surface | Browser | TUI |
| Task formulation | Board cards + sidebar chat | Markdown files + beads |
| License / model | Closed-ish (research preview) | km is personal tooling |

## Where Cline Kanban wins

- **Browser UX** — bigger screen, mouse-first, more discoverable than TUI.
- **Agent-runtime agnostic** — works with whatever agent you already use.
- **Shipped, polished, real users** — 60k+ ⭐ Cline userbase as a funnel.
- **Diff viewer is excellent** — checkpoint scoping + inline comments-as-feedback is a significant UX primitive.
- **Auto-commit/Auto-PR** — removes a whole category of manual work.

## Where km could win

- **TUI + local-first** — no browser required, zero-latency, works anywhere.
- **Bidirectional markdown sync** — the board IS the markdown, not a separate UI.
- **Years-ahead CRDT / event sourcing plans** — multi-device, offline, collab.
- **Silvery as foundation** — design system, composable, multi-target (TUI→canvas→DOM).
- **PKM integration** — notes+tasks+calendar unified, not just tasks.
- **Not tied to a single agent vendor** — km is the user's app; Cline is Cline's funnel.
- **Bead-based task model** — richer than Kanban cards (priority, dependencies, design/notes/acceptance sections).

## Product positioning options

### Option A: "km is the PKM Cline Kanban users graduate to"
- Cline Kanban gets them addicted to board-driven parallel agents.
- km offers: markdown-native, offline, CRDT, notes+calendar too, TUI + eventual web.
- Positioning: "Cline Kanban, but for everything, forever — not just this project."

### Option B: "km hosts Cline Kanban as a runtime"
- Implement Cline's kanban protocol / ACP in km.
- km becomes a board-visualizer for Cline/Claude Code/Codex agents.
- Smaller surface, depends on others' ecosystem.

### Option C: "km differentiates by being local-first + pure markdown"
- Don't compete on kanban features; compete on data sovereignty.
- Cline Kanban is a web app with backend features; km is files on disk.
- This is km's existing positioning — just sharpen the distinction.

### Option D: km ships its own "km --kanban" (browser view)
- Silvery's multi-target story says this should be possible.
- Browser view of km's board, same data, same agents.
- Catch up on discoverability while keeping TUI strength.

**My read**: Options A + C together. km is not trying to be "the kanban for agents"; it's trying to be "the knowledge machine that includes kanban." Cline Kanban validates the board-parallelism pattern without cornering the market for it. km's moat is everything-unified + local-first + bidirectional markdown, which Cline Kanban doesn't touch.

## What to steal from Cline Kanban

- **Checkpoint-scoped diffs** — view diff of a specific message range, not just cumulative. This is a great primitive for agent review.
- **Inline comments as agent feedback** — click a diff line, write a comment, agent picks it up. km's detail pane could do this for any diff-like content.
- **Sidebar chat as board controller** — "break this into 5 tasks and link them" → cards appear. km has beads; this UX could drive bead creation from chat.
- **Ephemeral worktrees with symlinked deps** — km already uses worktrees; symlinking node_modules is the right detail to copy.
- **Auto-PR with intelligent conflict handling** — agent does the merge. Higher trust level than most tools.
- **Task dependency chains that auto-trigger** — beads have deps but don't auto-start. Worth considering.

## What NOT to steal

- **Browser as primary surface** — km's TUI-first position is a differentiator, not a limitation.
- **Closed-ish research preview model** — km is OSS-aligned.
- **Vendor lock-in to Cline as runtime** — km should remain neutral about agents.

## Open questions

- Should km ship a browser view sooner to close the UX gap?
- Does the diff viewer + inline-comments pattern belong in silvery as a general primitive?
- Is the "agent runtime abstraction" (Cline's claim) worth implementing, or does ACP + MCP already cover it?
- Does km want to be an agent runtime (run Claude Code as a subprocess per board cell)?

## Architecture (from source inspection)

### Runtime stack
- **CLI**: `commander` (arg parsing)
- **Server**: Node with `ws` (websockets), **tRPC** for typed client/server RPC
- **Terminal multiplexing**: `node-pty` + `@xterm/headless` + `@xterm/addon-serialize` — real PTY per agent, serialized to web UI over WS
- **MCP integration**: `@modelcontextprotocol/sdk` for tool/resource interop
- **Locking**: `proper-lockfile` for worktree coordination
- **Process mgmt**: `tree-kill` for clean shutdown
- **Telemetry**: Sentry
- **Linting**: biome (notable — not oxlint or eslint)

### Runtime hooks architecture (from `.plan/docs/runtime-hooks-architecture.md`)

Each agent has different hook surfaces. Kanban normalizes them into a single state machine:

```
Terminal session starts
  → prepareAgentLaunch() builds per-agent command/env/config
  → agent process emits hook-relevant signals
  → agent hook/wrapper calls: `kanban hooks notify --event <to_review|to_in_progress>`
  → notify path best-effort dispatches: `kanban hooks ingest --event …`
  → hooks ingest calls runtime tRPC hooks.ingest
  → hooks API validates transition eligibility
  → session manager applies reducer transition event
  → runtime streams updated state to UI
```

**Two transition intents**: `to_in_progress`, `to_review`. Two session states: `running`, `awaiting_review`. Four board columns: `backlog`, `in_progress`, `review`, `trash`.

### Per-agent wiring
| Agent | Hook artifact |
|---|---|
| Claude Code | `~/.kanban/hooks/claude/settings.json` (rewrites Claude settings) |
| Gemini CLI | `~/.kanban/hooks/gemini/settings.json` |
| OpenCode | `~/.kanban/hooks/opencode/kanban.js` + `opencode.json` |
| Codex | `kanban hooks codex-wrapper` (runtime wrapper command) |

### Directory layout
- `~/.kanban/` — global config
- `~/.cline/kanban/config.json` — installed agent selection, workspaces
- `~/.cline/kanban/workspaces/<project>/` — per-workspace state
- `<repo>/.cline/worktrees/<task-id>/` — ephemeral worktrees per task

### Source organization
- `src/cli.ts` (1603 lines, actively being refactored)
- `src/cline-sdk/` — Cline-specific runtime setup
- `src/core/runtime-endpoint.ts` + `src/server/runtime-server.ts` + `src/server/runtime-state-hub.ts` — runtime subsystem
- `src/trpc/runtime-api.ts` — tRPC endpoints
- `src/server/`, `src/terminal/`, `src/workspace/`, `src/projects/`, `src/state/`, `src/security/`, `src/prompts/`, `src/fs/`
- `web-ui/` — separate React app
- `packages/desktop/` — Electron wrapper

### Task CLI (from live system-prompt inspection)

Every command returns JSON. Core surface:

- `kanban task list [--project-path] [--column backlog|in_progress|review|trash]`
- `kanban task create --prompt "…" [--title] [--base-ref] [--start-in-plan-mode] [--auto-review-enabled] [--auto-review-mode commit|pr|move_to_trash]`
- `kanban task update --task-id …`
- `kanban task start --task-id …` (creates worktree, launches agent)
- `kanban task trash --task-id …` (or `--column`, bulk)
- `kanban task delete …` (permanent)
- `kanban task link --task-id X --linked-task-id Y` (with auto-reorientation of the dependency arrow when one side leaves backlog)
- `kanban task unlink --dependency-id …`

**Plan mode**: tasks can be created in plan mode; first output is a plan for user approval before execution.

**Auto-review pipelines**: set `--auto-review-enabled true --auto-review-mode commit` on every task in a chain → each task auto-commits, auto-trashes, and auto-starts the next linked task. Fully autonomous multi-stage execution.

### Already deployed on this machine

- `~/.cline/kanban/` exists with `config.json` (selectedAgentId=claude), workspaces/, hooks/claude/settings.json
- Kanban had already configured this env before today's session (presumably user exploration)
- The "Kanban Sidebar Agent" prompt (seen in live Claude process args) is a **board-management-only** Claude instance — explicitly forbidden from editing files. Pure orchestrator.

## Three-layer model to understand kanban

1. **kanban (the library)** — OSS npm package, runtime + server + web UI. This is the strategic play.
2. **cline (the agent)** — one of several runtimes kanban can drive. Cline the company dogfoods it.
3. **cline --kanban** — installer UX that bootstraps the kanban library if missing and launches it.

The separation is important: kanban-the-library lives on with or without cline.

## What this changes for km

Original competitive framing was "Cline Kanban is a product that competes with km." Revised framing is stronger:

> **Cline is trying to establish `kanban` as the standard orchestration layer for all coding agents. If it succeeds, km either adopts it, competes with it, or becomes "another runtime" inside it.**

The runtime-hooks protocol is narrow and well-documented (`to_review` / `to_in_progress` + JSON CLI). km could:

- **Become a kanban runtime** — km agents start tasks via `kanban hooks notify` and appear in the board like any other
- **Fork/adopt the kanban protocol** — use the same CLI surface + state machine, bridge to beads
- **Stay independent** — lean into PKM + markdown + TUI strengths; treat kanban as a sibling tool
- **Replace it** — km ships its own equivalent with better data model + sync story

The diff viewer + inline-comments-as-feedback + auto-review-mode=commit/pr are the strongest UX ideas and are transferable regardless of whether km joins kanban or competes.

## Sources

- [cline/kanban repo](https://github.com/cline/kanban) (Apache-2.0, 711 ⭐, 165 forks)
- `.plan/docs/runtime-hooks-architecture.md` — architecture doc in the kanban repo
- `.plan/cli-runtime-refactor-plan.md` — refactoring plan showing internal structure
- `src/trpc/runtime-api.ts`, `src/server/runtime-server.ts`, `src/cline-sdk/` — runtime integration code
- Live inspection: `kanban --help`, `kanban --version` (0.1.63), `~/.cline/kanban/` filesystem, running Kanban Sidebar Agent's Claude process args (revealed full task-CLI surface + system prompt)
