# km ↔ Kanban Integration Strategy

Strategic analysis of how km should integrate with Cline Kanban's hook protocol. Internal doc; not for public site.

Context: Cline Kanban (cline/kanban, Apache-2.0, 711 ⭐) ships a normalized hook protocol (see [`kanban-hook-protocol.md`](../../../../../Bear/Journal/ref/coding-agents/kanban-hook-protocol.md)). Cline is positioning it as the orchestration standard for coding agents. km has to decide how to relate to it.

Related bead: [`km-infra.hook-router`](../../../).

## Four options

### Option A: km-as-runtime (emit hook events)

km shells out to `kanban hooks notify` when bead state changes or km-tui takes agent-like actions. km appears as a first-class agent in any kanban board.

- **Effort**: ~100 LOC (shell wrapper + bead state-change listener, trivial under the unified hook-router)
- **Gain**: presence in every kanban board; no user-facing UX change for km itself
- **Risk**: none — purely additive; if kanban protocol changes, one file updates

### Option B: bead ↔ card sync

Bidirectional sync: new kanban card creates a bead; `bd close` trashes the card. Bead description markdown pairs with card prompt text.

- **Effort**: ~200 LOC (sync daemon, or hook-router listener that also watches kanban)
- **Gain**: users can work from either surface — bd list or kanban board — with state staying consistent
- **Risk**: low; bead is source of truth, kanban is a secondary view

### Option C: km-tui as kanban client

km-tui subscribes to kanban's tRPC stream, renders the board in silvery, delegates commands back to the kanban CLI. TUI kanban view that works with any agent.

- **Effort**: ~500–1000 LOC (tRPC client, board-view component, command delegation)
- **Gain**: TUI kanban surface — the whole "kanban for agents" UX without a browser. Plays to silvery's strengths.
- **Risk**: UI surface area in km-tui; competes with the browser board on features; tracking kanban's API changes

### Option D: km as peer orchestrator

km implements the `hooks ingest`/`notify` protocol itself, backed by beads + km's sync story. Other agents plug into km the same way they plug into kanban.

- **Effort**: substantial — a new subsystem, runtime server, hooks daemon, state hub
- **Gain**: km becomes a first-class orchestrator; bead is the unit of work; kanban becomes one of many UIs
- **Risk**: significant investment; only worth it if (a) kanban protocol becomes de facto standard AND (b) km wants to compete at the orchestrator layer rather than the PKM layer

## The fifth option: Matrix

Orthogonal but worth naming: km could integrate via Matrix chat rooms instead of (or alongside) kanban. Each task = a room; agents are bots; humans and agents share the message stream.

- **Pro**: federation, multi-user, async collaboration
- **Con**: weak state visualization; parallel workflows don't render naturally
- **Fit for km**: good for family/team agent conversations, weak for solo parallel execution
- **Recommendation**: keep in mind for future "km assistant to the household" mode, but not the primary play for coding agent integration

## Recommendation

**A + B now, layer C later, D reframed: not "km wins the protocol" but "km hosts the plan."**

- **A + B** (~300 LOC total, shipped through the hook-router) gives km ecosystem presence cheaply. Cline Kanban users get km's PKM for free; km users get kanban's parallel-agent UX for free. Both reversible, no API commitment.
- **C** (~500–1000 LOC) becomes attractive once silvery can render a kanban board that feels genuinely better than the browser. Under the [updated km vision](../design/vision.md), km is *the workspace* for agentic knowledge work; rendering a kanban that's a first-class workspace surface (next to silvercode panes, recall, journal) is exactly what km is for. The multi-target thesis says this is where silvery should shine. Ship when ready — and treat it as a km surface, not just a kanban client.
- **D — reframed.** Under the old frame "km as peer orchestrator" was an ambitious move because km was positioned as PKM, not orchestration. Under the new frame it's the natural shape: **km hosts plans of any orchestration shape as data; the runtime that executes them lives outside km** (in tribe + agent personas + external schedulers like Cline Kanban, Symphony, or homegrown). km doesn't need to "win the protocol" — it needs to be the **lingua franca planning surface** that any orchestration runtime can read and write. Hooks ingest is one such read-write protocol; ACP is another at a different layer; Symphony's `WORKFLOW.md`-as-repo-contract is a third. km should *speak all of them* over time, exposing beads + facets + recall as the substrate. The bead remains the unit of work; the kanban hook protocol, ACP, and `WORKFLOW.md` are wire formats km speaks at the integration boundary.

## Cross-reference: Symphony (OpenAI, 2026-03)

OpenAI's [Symphony](https://github.com/openai/symphony) (open-sourced 2026-03-05) adds a third candidate to the orchestration-protocol monitoring set alongside Cline Kanban hooks and Zed ACP. Shape: long-running daemon polls Linear, spawns Codex per active issue in a per-issue git workspace, retires on terminal state. Policy lives in a repo-owned `WORKFLOW.md` (YAML front matter + prompt body). Reference impl in Elixir/BEAM; spec is language-agnostic.

Under the updated km vision, Symphony is **a runtime that reads km as the plan**, not a competitor to km. The natural km expression of Symphony's pattern:

- The Linear board → a km bead board with `workflow` facet
- `WORKFLOW.md` → a KNode with `workflow` facet carrying YAML config + prompt body
- Per-issue workspace → `bun worktree` per claimed bead (km already has this)
- Codex spawn → a silvercode pane bound to the worktree, persona-assumed
- Status updates → structured events in a tribe room linked to the bead
- "Done"/"Human Review" → bead state transition, surfaced in km's board view

None of this requires Symphony to be inside km. It requires km to **host the plan and render the runtime's progress against it** — which is what the km workspace already does.

Action: track Symphony alongside ACP and Cline Kanban hooks in the orchestration-standard monitoring item below.

## Composability with the unified hook router

All four options become cleaner after `km-infra.hook-router` is shipped. The router treats kanban-bridge as *one listener* among many:

```
~/.claude/hooks.d/
├── recall.ts           # session-history search
├── tribe.ts            # multi-session coordination
├── bead.ts             # bead lifecycle auto-claim
├── kanban-bridge.ts    # option A+B implementation
└── ...
```

The listener for kanban-bridge is ~50 LOC: watch bead state changes, forward to `kanban hooks notify`, subscribe to kanban's tRPC for reverse sync. Simple and isolated.

## What happens if we do nothing

- km stays a standalone PKM/TUI with its own agent workflow
- Cline Kanban becomes the de facto board for coding agents
- New users default to kanban, then discover km separately via PKM angle
- Risk: km's "kanban in km-tui" story becomes redundant with cline kanban's momentum
- Mitigation: lean harder on PKM + markdown + local-first differentiation (which km does well)

Doing nothing is a legitimate position — but adopting A+B costs almost nothing and hedges the scenario where kanban protocol becomes universal.

## Action items

- [ ] Ship `km-infra.hook-router` — the router is the substrate for everything else
- [ ] Open sibling bead: `km-infra.kanban-runtime` — implements Option A as a listener
- [ ] Open sibling bead: `km-infra.bead-kanban-sync` — implements Option B
- [ ] Revisit Option C in 3–6 months once silvery is ready to render boards as first-class km workspace surfaces (per updated vision: km is the workspace, not a separate kanban client)
- [ ] Reframe Option D as "km speaks all orchestration wire protocols" — open beads as evidence emerges that any of {kanban hooks, ACP, Symphony WORKFLOW.md, MCP tools} is becoming the de facto integration boundary
- [ ] Track: which orchestration wire becomes standard? Three candidates today: Zed ACP (agent↔editor), Cline Kanban hooks (agent↔board), OpenAI Symphony `WORKFLOW.md` (repo-owned daemon contract). Different layers; compete for the "integration substrate" mindshare. Monitor: Anthropic ACP/MCP posture, OpenAI Symphony adoption, third-party orchestrator clones

## Related

- Bead: `km-infra.hook-router` — P3, the substrate for integration listeners
- General reference: [`~/Bear/Journal/ref/patterns/agent-orchestration-hooks.md`](../../../../../Bear/Journal/ref/patterns/agent-orchestration-hooks.md)
- Protocol reference: [`~/Bear/Journal/ref/coding-agents/kanban-hook-protocol.md`](../../../../../Bear/Journal/ref/coding-agents/kanban-hook-protocol.md)
- Silvery competitive: [`hub/silvery/competitive/cline-kanban.md`](../../silvery/competitive/cline-kanban.md)
- km design doc: [`docs/design/hook-router.md`](../../../docs/design/hook-router.md)
