# /big lens — dimensions missing from the first-pass brainstorm

Applying `/big` after stepping back: what belongs in this frame that the five-bead pass didn't explicitly call out?

## A. Permissions & sandbox as first-class

CAP manifests declare **intent + permissions** (reads-fs, writes-fs, network, spawns-child, touches-$HOME, touches-keychain). Commander gates *before* running. Agents can't exfiltrate or rm -rf without human approval because the gate lives **above** the command, not inside it.

This is arguably the **killer feature for agent safety** — more important than any UI. Warp doesn't have it (bash underneath leaks). nushell doesn't. MCP does (tool manifests) but only for MCP-native tools. CAP extends that guarantee to *every* CLI with a manifest.

Design:
- Every CAP call goes through a policy checkpoint
- Policy is per-session, inherited from parent with tightening-only
- Violations → typed `wants-permission` event → human or parent decides
- Audit log of every gate decision (replayable)

## B. Observability structural, not bolted on

Every block is a trace span. Every session is a trace root. Cross-session pipes (`link A B`) create distributed traces. "Why was this slow?" → hover a block → see the whole tree.

Loggily already gives us the instrumentation plumbing; this layer just exposes it in the UI. Adds:
- Flame-graph render for session trees
- Per-command latency histograms
- Correlation of agent token usage with tool-call latency
- "Re-run with instrumentation" as a first-class action

## C. Time-travel / rollback within session boundaries

`.tape` + typed blocks + CAP's `touches-fs` intent → rollback is a first-class session operation. Not git-scoped; session-scoped. "Undo last 3 commands" makes sense when you know what they touched.

- Every fs-writing CAP call records before-state (or git ref)
- Session-scoped undo stack
- Forkable: "what if I had done X instead" spawns a branch session from a prior state
- Shareable: "here's the session at step 5" as a link

## D. Collaborative sessions (multi-human + multi-agent, one session)

Tribe already solved cross-session coordination at the daemon level. Extend *inward*:
- Presence indicators per pane (who's watching / typing)
- Simultaneous-input merging (Figma-for-terminals — multiple cursors, last-write-wins or CRDT)
- Human↔agent handoff (`handoff S to @beorn`)
- Replayable via tape

The wedge: pair-programming with an agent, or multi-human debugging with agents as participants. Neither exists today.

## E. Local-first, network-transparent

Silvery already renders anywhere; CAP is JSON-RPC. A session tree can span machines: agents run on cloud, commander renders locally. Same components. No "remote shell" as a separate product.

Implementation: session proxy that tunnels typed events over WebSocket/HTTPS. CAP calls and block streams flow transparently. Host terminal (your laptop) renders session output; actual compute happens wherever the PTY lives.

Killer use case: developer runs expensive refactor agent on cloud, watches it from laptop, hands off to teammate's laptop when going to sleep.

## F. Accessibility by construction

Blocks are semantic. Screen readers get meaning, not ANSI. Every CAP command is keyboard-complete because palette + flag forms are keyboard-navigable by default.

This is a moat. Warp and cmux are mac-native TUIs where accessibility is a retrofit. Ours is structural — screen-reader-friendly day 1, because silvery's component model forces semantic markup.

## G. `cap-wrap` + community manifest registry

CAP adoption fails without this. `cap-wrap git` parses `git --help` into a manifest heuristically. Community curates and polishes. Registry at `cap.silvery.dev` (or similar) — git-versioned, PR-reviewed, distributed via CDN. Without this, CAP is a beautiful spec with five entries.

Components:
- `cap-wrap <tool>` — heuristic manifest generator
- `cap-lint <manifest>` — validator
- `cap-registry` — git repo of polished manifests
- Commander auto-syncs registry on version bump
- PR workflow for contributing manifests

## H. Static + runtime contract checking

Manifests are inspectable statically. Build lint: "your manifest says `outputs: table` but your code emits `log` blocks." Runtime enforces. Catches drift before users notice.

## I. Migration path: silvery-shell-in-bash first

Don't force users to switch login shell. v0 silvery-shell runs **inside** bash/zsh as a subprocess; captures blocks via OSC 133; users get progressive enhancement. Later, once they trust it, they can set it as login shell. No flag-day.

## J. Economic model: source-available, BYOK, community-led registry

- CAP registry free + community-maintained (not gated marketplace)
- Plugins earn nothing by default
- Sustainability via: OSS donation, paid hosted sync service (for team workspaces), enterprise compliance tier
- No protocol lock-in

## K. Plugin architecture via silvery components

Block renderers, capability providers, intent taxonomies — all silvery components. Anyone can ship a `<DiffBlock>` that's better than the default. Commander loads by convention (`@silvery-cap/*` packages), no bespoke plugin API.

## L. Dev-time affordances for CAP authors

- `silvery cap init my-tool` — scaffolds manifest + block emitters for a new CLI
- `silvery cap lint` — validates
- `silvery cap test` — records example invocations as tape
- `silvery cap dev` — hot-reload commander with an in-progress manifest

Lowers friction for tool authors to adopt CAP.

## M. Web-native deployment

Silvery has a web target. Commander in a browser = devtools over WebSocket, same components, same blocks. "ChatGPT Code Interpreter but typed and open."

Especially powerful paired with session handoff (E): cloud-run agents, browser-rendered commander, handoff to/from local terminal freely.

## N. Non-terminal inputs: voice, gesture, camera

Far-future, but: palette is "anything that ranks intent." Voice input, camera-based gesture (accessibility), clipboard-watch intents ("you pasted a URL, want to preview as `gh pr view`?"). Silvery's input abstraction is ready for it.

## O. Training data & fleet telemetry (opt-in)

CAP calls + success/failure + duration → anonymized aggregated fleet data. Powers:
- "What flags do people actually use on `gh pr create`?"
- "What typo patterns should palette auto-correct?"
- "What third-party tools lack manifests but get used a lot?" (ranked adoption queue)

Strictly opt-in, fleet-aggregated, never leak content.

## P. Bun Shell's JS lineage — reusability angle

Bun Shell (`Bun.$`) is written in Zig but the template-literal API comes from [`zx`](https://github.com/google/zx) (Google) and [`dax`](https://github.com/dsherret/dax) (Deno-origin, Bun/Node-compatible).

**Options for commander's exec engine**:

- **Bun.$** — fast, battle-tested, no runtime dep. Cost: Bun lock-in.
- **dax or zx as library** — cross-runtime, no Bun dependency, usable if commander ships Node-native one day.

**Recommendation**: `dax` as default; `Bun.$` as fast-path optimization when available. Keeps commander portable.

## Q. Session-workspace model (spans L3 + L4)

Sessions grouped into **workspaces** — a workspace has default policy (dev vs prod), default bus, default tape recording, default membership (which humans/agents can join). km's kanban → commander's workspace is a natural consumer.

Workspace examples:
- "main dev workspace" — loose policy, full network, broad fs
- "prod debug" — read-only, audit-heavy, no mutations
- "sandbox" — ephemeral, isolated fs, unlimited policy

Agents spawned in a workspace inherit its defaults.

## R. "Explain" layer (spans L2 + L3)

Every block carries a `why` trail: command, flags, cwd, env, caller (which session, which agent, which task). Blocks are fully inspectable for compliance, debugging, and AI reasoning.

This is the thing that makes multi-agent sessions **debuggable** — today they're black boxes with logs; with this they're traceable trees.

## S. Contracts for long-running agents (spans L4 + L5)

When spawning an agent session, declare budget: "I will do X, needing Y tokens, Z tools, W wall-clock time." Commander enforces bounds; auto-pauses on overshoot; requests continuation explicitly.

Prevents runaway agents without disabling autonomy. Budget = time × tokens × tools × fs-writes × network-calls.

## T. Workflow-as-artifact (spans L3 + L4 + L5)

A composed DAG of CAP calls is a saveable artifact. Export as a `.flow.json`. Re-run later. Share with teammates. Agents produce flows; humans review + tweak + run.

This is `nushell` pipelines or Make or Airflow — but typed, inspectable, visual-composable in commander.

## U. Non-interactive agent modes (integration track amendment)

Added 2026-04-23 after user question.

Running wrapped coding agents in their **non-interactive modes** (`claude -p` / `claude --output-format=stream-json` / `codex --json` / etc.) bypasses most of the grid-parsing complexity:

- Agent emits structured events, we consume them directly
- No alt-screen games, no capability-negotiation for the agent itself
- Our UI renders in silvery components, fully native
- The "wrap & drive" TUI integration becomes a **fallback** for when the agent doesn't have a non-interactive mode

Bonus: JSONL session files in `~/.claude/projects/` are structured and canonical. Tail them instead of parsing TUI grid.

Implications for 02-agent-integration:
- Grid parsing becomes the worst-case path, not the primary
- Each agent adapter is "find the structured mode and use it"
- For Claude Code specifically: tail JSONL + `-p --output-format=stream-json` for driving

## V. First-class replay-as-test

Agent runs are `.tape`-recordable. Flip that around: **regression tests are replays**. "Claude Code should handle refactor X correctly" becomes a tape + assertion against the final state. Agent model upgrades re-run the tape suite — regressions surface deterministically.

This turns into a testbed for agent comparison: same tape, different agents, diff results.

## W. Agent persona library

Collections of configured agents (system prompts, tool sets, policies, budgets) as reusable artifacts. `@silvery-persona/planner`, `@silvery-persona/reviewer`, `@silvery-persona/bug-hunter`. Install like packages; spawn like processes. Composable (see T — workflow-as-artifact).

---

## Priority ranking (subjective)

Most likely to determine whether the whole thesis works:

1. **A (permissions)** — makes agent adoption safe
2. **G (cap-wrap + registry)** — makes CAP adoption scale
3. **I (migration path)** — makes commander adoptable without flag-day
4. **U (non-interactive modes)** — makes integration track 10× simpler
5. **B (observability)** — makes multi-agent runs debuggable

Nice-to-haves that compound:

6. **E (network-transparent)**, **M (web-native)** — distribution reach
7. **D (collaborative)** — pair-coding wedge
8. **F (accessibility)** — moat
9. **C (time-travel)**, **V (replay-as-test)** — quality leverage

Far-future:

10. Everything else — keeps for later
