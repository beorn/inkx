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

**A + B now, layer C later, D as an open option.**

- **A + B** (~300 LOC total, shipped through the hook-router) gives km ecosystem presence cheaply. Cline Kanban users get km's PKM for free; km users get kanban's parallel-agent UX for free. Both reversible, no API commitment.
- **C** (~500–1000 LOC) becomes attractive once silvery can render a kanban board that feels genuinely better than the browser. The multi-target thesis says this is where silvery should shine. Ship when ready.
- **D** is the ambitious "km wins the protocol" move. Hold off until the signal is clear that kanban-the-protocol (or ACP, or something else) has become the standard. If it has, km either implements it or cedes the orchestrator layer.

## Composability with the unified hook router

All four options become cleaner after `km-infra.hook-router` is shipped. The router treats kanban-bridge as *one listener* among many:

```
~/.km/hooks.d/
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
- [ ] Revisit Options C / D in 3-6 months once kanban protocol adoption signal is clearer
- [ ] Track: does Zed's ACP (agent↔editor) or kanban hooks (agent↔board) win as the orchestration standard? Different layers but compete for the same "integration substrate" mindshare. Monitor: does Anthropic promote ACP adoption, or stick to MCP-only (tools)? Does OpenAI adopt either? Does another orchestrator clone kanban's protocol?

## Related

- Bead: `km-infra.hook-router` — P3, the substrate for integration listeners
- General reference: [`~/Bear/Journal/ref/patterns/agent-orchestration-hooks.md`](../../../../../Bear/Journal/ref/patterns/agent-orchestration-hooks.md)
- Protocol reference: [`~/Bear/Journal/ref/coding-agents/kanban-hook-protocol.md`](../../../../../Bear/Journal/ref/coding-agents/kanban-hook-protocol.md)
- Silvery competitive: [`hub/silvery/competitive/cline-kanban.md`](../../silvery/competitive/cline-kanban.md)
- km design doc: [`docs/design/hook-router.md`](../../../docs/design/hook-router.md)
