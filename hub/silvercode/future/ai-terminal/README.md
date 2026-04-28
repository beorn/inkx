# AI-era terminal: what silvery's building blocks enable

**Status**: technical exploration and ideation. Originated 2026-04-23 from `/recall cline`. Expanded into an inventory of what the silvery terminal stack makes technically enable in the coding-agent era. Moved out of beads because P4 is for roadmap; this is pre-roadmap ideation.

**Frame**: this is **not** a product plan, not a commitment, not even a validated hypothesis. It's a catalogue of what the **terminal building blocks we already own + one missing primitive** *technically* enable — with a focus on integrating with, wrapping, and *authoring* coding agents. Whether any of it is *useful* or has *business value* is a separate question we have not yet asked.

**Updated framing (2026-04-27)**: per the [updated km vision](../../../km/design/vision.md), km is the **workspace for agentic knowledge work, including coding**. silvercode is not a separate agent-host product — it is the **coding-flavored surface of the km workspace**, sharing the same substrate (beads, recall, tribe, persona files, silvery rendering) as km-tui's board / notes / calendar surfaces. The orchestration / harness / agent-host layering below remains a useful technical taxonomy, but the product question collapses: there is one workspace (km) with multiple surfaces, of which silvercode is one.

## What we've done vs what's still open

- **Done**: inventory the building blocks; enumerate what's buildable; identify the one missing primitive (`@silvery/pty`); sketch layered architecture; catalogue use cases; surface hard problems; apply /big lens; phase-plan the engineering.
- **Not done**: validate that any of this solves a problem users actually have; market-size the use cases; identify willing buyers or daily-drivers; figure out positioning, pricing, or distribution; compete-analyze against Warp/cmux/claude-squad/tmux/MCP on real adoption metrics; test whether any of the /big dimensions (permissions, observability, collaborative sessions, web-native) are things people want or would pay for.

**Before any of this becomes roadmap**, we need to separately answer: who needs this, would they pay for it or switch tools for it, what's the smallest validatable wedge, and does the business case hold.

**Provenance**: replaces five P4 beads — `km-silvery.agent-harness`, `km-silvery.multiplex`, `km-silvery.shell`, `km-silvery.commander-protocol`, `km-silvery.sessions`. Closed with reason pointing here.

---

## Terminology

Four terms get used throughout these docs. They stack:

| Term | Scope | Answers |
|---|---|---|
| **agent** | LLM + tool loop + behavior | "what is the model doing?" |
| **agent harness** | integration scaffold for one agent | "how does this agent plug into our app?" |
| **orchestrator** | coordinator for N agents | "how do multiple agents work together?" |
| **agent host** | user-facing product | "what does the user open?" |

The user opens an **agent host**; inside it, an **orchestrator** manages multiple agents; each agent runs in an **agent harness** (SDK bridge + policy gate + UI bindings); the harness invokes the **agent** (Claude/GPT/etc. via its SDK).

Industry usage is inconsistent — "coding agent" gets used colloquially for all four. In these docs we keep them distinct.

**Updated mapping under the km-as-workspace frame (2026-04-27)**: the four-layer split is still the right *technical* taxonomy, but the product mapping is:

- **agent host** → km, the workspace. The user opens km; silvercode panes are agent-pane *surfaces* inside the workspace, alongside boards / notes / calendar / tribe rooms.
- **orchestrator** → tribe + km plans. Multi-agent coordination is bottom-up tribe (peers, leases, ambient) plus top-down km plans (boards with deps, autonomous-dispatch boards). External orchestrators (Cline Kanban, Symphony) read km as data; their output renders as workspace surfaces.
- **agent harness** → silvercode's per-pane harness (`apps/silvercode/src/`). One harness per pane; harnesses share `CrossAgentState` and the ambient-context-safety pipeline.
- **agent** → Claude / Codex / Gemini / Copilot / opencode, invoked through ACP or vendor SDK.

---

## The core observation

Silvery has quietly accumulated almost every piece needed to do AI-era terminal tooling. Individually the pieces have narrow purposes. Composed, they form a substrate no one else has:

| Piece | What it does | Relevance |
|---|---|---|
| `@vterm/modern` | ANSI emulator grid (99% conformance) | Host nested TUIs without escape-sequence leakage |
| `@vterm/vt100` | VT220 baseline (57% conformance) | Low-end conformance oracle |
| `termless` | Headless terminal driver | Automation, introspection, tests |
| `terminfo.dev` | Terminal capability database | Capability-negotiation ground truth |
| `bearly/tribe` | Cross-session JSON-RPC bus over UDS | Coordination for agents + humans |
| `bearly/recall` | Session history / FTS index | Cross-agent memory |
| `mdtest` tape plugin | VHS .tape record/replay | Deterministic replay of agent sessions |
| `silvery` core | Components, state, ag-term reconciler | Rendering across terminal / canvas / DOM |
| `silvery-selection` | Pointer / input abstraction | Mouse, hover, focus — rare in TUIs |
| `flexily` | Layout engine | Splits/tabs/tiles |
| `alien-*` | Reactive primitives (signals, trees, projections, resources) | Efficient block/state handling |
| **Missing: `@silvery/pty`** | PTY wrapper | The one atom we need to build |

**Conclusion**: we are one primitive (`@silvery/pty`, maybe 200–500 LOC) away from being able to build almost anything in the terminal + AI space. That includes the five ideas filed in beads — but also includes things we hadn't yet named.

## What this enables (use-case catalogue)

Not products, not decisions — surface area. Each of these is independently buildable once the substrate is in place.

### A. Agent harness — integrate & drive existing agents

Build the **harness** that takes an agent (Claude, GPT, etc. via SDK or CLI stream) and makes it runnable inside our app with typed events, policy gates, and silvery-component UI.

**Decision (2026-04-23)**: we own the launcher. Users spawn agents *through* our app. This collapses to SDK-direct (Claude Agent SDK) or structured streaming (`claude -p --output-format=stream-json`) — no PTY wrapping, no terminal grid parsing. The harness provides:

- Event stream ingestion from SDK or `-p` mode
- Silvery rendering of `<MessageList>`, `<ToolCallBlock>`, `<TodoPanel>`, `<ActiveAgents>`, `<StatusLine>`, `<PermissionDialog>`, `<ModeSwitcher>`
- Policy gate for permission requests, budget enforcement
- Vendor adapters (Claude first; Codex/opencode/aider as fallbacks)

→ [02-agent-integration.md](02-agent-integration.md)

### B. Agent host — author new silvery-native agent hosts

Build our own agent host — a silvery-native product where the agent logic is ours (SDK-direct) and the UI is silvery:

- Rich UI (blocks, forms, hover, mouse) via silvery components
- Scrollback-first, not alt-screen-only
- CAP-native tool use — the agent invokes typed CAP calls, not string commands
- Tape recording of every turn → replayable, diffable, regression-testable
- Tribe coordination as first-class — multi-agent is default
- Human handoff at any turn — humans and agents as peers
- km-as-memory — long-term context in the user's knowledge graph
- Peer-agent personas (planner, coder, reviewer, tester) as fibers under one worker

Cline's dual-surface architecture (VSCode webview + TUI) is the existence proof that this shape works. We'd do the same on silvery's multi-target rendering (terminal/canvas/DOM).

→ [03-agent-authoring.md](03-agent-authoring.md)

### C. Multiplex substrate (panes/splits/tabs as components)

Ship tmux-equivalent capabilities as silvery components + a daemon, not a binary. `<PtyPane>`, `<SplitLayout>`, `<TabBar>`, `<ScrollbackView>`, `<StatusBar>` — composable with non-terminal UI (km cards + PTY panes in one layout). Session persistence via bearly-daemon piggyback. Same `<PtyPane>` renders on terminal/canvas/DOM — remote/web-terminal apps fall out.

→ [04-multiplex.md](04-multiplex.md)

### D. CAP — Commander App Protocol

Typed protocol CLIs speak to shells + agents. Manifest (flags, intents, permissions, outputs). Typed blocks (table/log/diff/image/prompt). Typed completion. MCP-tool duality — manifest doubles as MCP tool schema, so agents invoke CAP apps as tools, not as text commands.

This is the leverage point that makes "millions of apps" tractable. `cap-wrap` retrofits manifests onto classic CLIs by scraping `--help`, so adoption starts at day 1.

→ [05-cap-protocol.md](05-cap-protocol.md)

### E. Commander (rich shell, reference app for CAP)

One silvery-app where shell-input is *one component* alongside palette, flag forms, block list, result pane. Scrollback-first rich UI (silvery ANSI into real scrollback, not Warp's alt-screen-only trap). Progressive enhancement inside a multiplex. Agent-first gate on command execution.

→ [06-commander.md](06-commander.md)

### F. Sessions — typed job control for humans + agents

Generalize Unix job control. Sessions are the unit of work; typed events replace signals. `&`, `fg`, `jobs` become peer operations over humans + agents + watchers + subprocesses. New verbs: `tee A B`, `link A B`, `subscribe S event`, `compose A B C`, `handoff S to P`. This is how multi-agent orchestration stops being bespoke and starts being primitive.

→ [07-sessions.md](07-sessions.md)

### G. Supervision hierarchy + stdlog (fd3) + stdapi (fd4)

Underneath all of the above — *if* we pursue any of it — sits the legion-project idea of a single unified supervision tree spanning management-node → host → worker → fiber, with structured concurrency built in, and with `stdlog` (structured JSONL on fd3) and `stdapi` (JSON-RPC on fd4) as Unix-native conventions for any app to opt into.

Frame: it's the `docs/principles.md § Alignment` principle applied to deployment. Same names at every level; "spread" works from local dev to prod; 12-factor++ compat gets any modern app plugged in for free. The terminal IS the dashboard — commander walks the same tree from laptop to datacenter.

→ [08-supervision.md](08-supervision.md)

---

## /big additions — what's missing from a first-pass read

Stepping back, these dimensions belong in the frame but weren't explicit in the original beads. See [big-ideas.md](big-ideas.md) for the expanded list. Short version:

- **Permissions & sandbox as first-class** — CAP manifests declare intent; commander gates before running. Agent-safety killer feature.
- **Observability structural, not bolted on** — every block is a trace span, every session a trace root.
- **Time-travel / rollback within session boundaries** — tape + typed blocks + fs-intents make it work.
- **Collaborative sessions (multi-human + multi-agent)** — tribe, extended inward. Figma-for-terminals.
- **Local-first, network-transparent** — session trees that span machines, rendered locally.
- **Accessibility by construction** — blocks are semantic, not ANSI.
- **`cap-wrap` + community manifest registry** — CAP adoption fails without this.
- **Migration path: silvery-shell-in-bash first** — don't force login-shell switch.
- **Web-native deployment** — commander in a browser, same components, same blocks.
- **Training-data / fleet telemetry (opt-in)** — aggregate flag usage, typo patterns, missing-manifest rankings.
- **Workflow-as-artifact** — DAGs of CAP calls are saveable / shareable / re-runnable.
- **Contracts for long-running agents** — declare budget at spawn; commander enforces.
- **"Explain" layer** — every block carries provenance. Makes multi-agent runs debuggable.
- **Bun Shell's JS lineage (`zx`/`dax`)** — using `dax` underneath keeps commander portable beyond Bun.

---

## Reading order

- [01-building-blocks.md](01-building-blocks.md) — the stack inventory, what's missing, the critical-path atom
- [02-agent-integration.md](02-agent-integration.md) — wrap & drive Claude Code, Codex, opencode, aider
- [03-agent-authoring.md](03-agent-authoring.md) — build new silvery-native coding agents
- [04-multiplex.md](04-multiplex.md) — panes/splits/tabs as components
- [05-cap-protocol.md](05-cap-protocol.md) — typed protocol for CLI↔shell/agent
- [06-commander.md](06-commander.md) — rich shell, reference CAP consumer
- [07-sessions.md](07-sessions.md) — typed job control
- [08-supervision.md](08-supervision.md) — supervision hierarchy + stdlog (fd3) + stdapi (fd4); alignment-as-deployment-principle (12-factor++); unified tree from mgmt node to in-process fiber
- [09-agent-host-landscape.md](09-agent-host-landscape.md) — Type-M survey: own-loop agent hosts (Claude Code, Cline, opencode, aider, pi-mono, hermes-agent, …)
- [10-agent-router-landscape.md](10-agent-router-landscape.md) — Type-A deep dive: meta-orchestrators that wrap other agent CLIs (OpenClaw, claude-squad, opcode, vibe-kanban, happy, conductor, hermes-agent-planned) + Type-R inverse (container-use). MECE taxonomy, transport subspecies, what to steal/avoid.
- [silvercode-squad-mode.md](silvercode-squad-mode.md) — **the validated near-term wedge** (2026-04-27). Multi-pane parallel-agent execution with CrossAgentState file-claims + shared project index + ambient handoff. Synthesized from /deep + /pro pass on the coding-agent landscape; supersedes the open-ended "build a coding agent" exploration for *immediate* product focus.
- [big-ideas.md](big-ideas.md) — /big lens additions
- [feasibility.md](feasibility.md) — blockers, sequencing, critical path

---

## The frame, stated plainly

**We own most of a stack nobody else has assembled.** In the AI era — where coding agents live in terminals, need coordination, need typed IO, need replay — owning this stack lets us ship a category of tools that aren't buildable elsewhere on reasonable timelines.

Two bets ride on top:

1. **Integration bet**: wrap existing TUI agents (Claude Code, Codex, opencode) with silvery-native UX. Daily-driver for power users, possibly products. Near-term.

2. **Authoring bet**: silvery-native TUI coding agents that are structurally better than alt-screen byte-stream peers. Longer-term, higher ceiling.

Everything else in the catalogue — multiplex, CAP, commander, sessions — is either enabling substrate for these two bets, or side benefits that fall out of the substrate for free.

## What's not scoped here

- **Business value** — whether any of this is useful to real users, whether they'd pay / switch / adopt. The docs establish *technical* feasibility only.
- Which specific product to ship first
- Whether any of this goes OSS vs stays private
- Team structure / hiring / funding
- Naming (Commander vs something else — bikeshed later)

## Next (exploration, not commitment)

1. `/pro review` this whole vision (fired; recover with `bun llm recover resp_092418ddf6b1cf390069eb0ac1f2e081968a5ad5e6782cb094`) — expect blockers, dimensions we missed, scope reality-check
2. **Separate workstream before scheduling**: user-value validation — who needs this, what's the smallest wedge that proves utility, would people actually switch / pay
3. Decide `@silvery/pty` implementation strategy *if* we pursue any of this — the single critical-path atom
4. Revisit once km and silvery 1.0 ship and we have capacity to explore non-core work
