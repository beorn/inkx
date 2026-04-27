# Futures

Aspirations, considered alternatives, parked designs, and deferred work. Read this when you want to know what we've thought about but haven't shipped.

**Do NOT treat anything here as a committed obligation.** The shipped state lives in [hub/architecture.md](./architecture.md) and [hub/composition.md](./composition.md). If a primitive, factory, or table appears here but not in those docs, it is speculative — code should not be built to honor it without an explicit driving consumer.

This file exists because mixing aspirational design into current-state docs caused doc-led drift: readers (humans and agents) treated speculation as committed work. See the 2026-04-27 retrospective for the three drift incidents that motivated the split.

## TEA effect-emission shape

The outer app-level `dispatch(op) → apply(op)` plugin bus is being designed; how its return shape relates to inner-reducer effects is the open coordination question. Inner domain reducers (`Board.apply(state, op) → [state, effects]`, `Tree.apply(...)`) are shipped per [docs/design/tea.md](../docs/design/tea.md); the outer bus is not.

- Open: whether `dispatch` and `apply` are publicly distinct, what the outer return shape is, and how outer effects compose with inner-reducer effects.
- Tracked in: `km-silvery.tea`.
- See also: [docs/design/tea.md](../docs/design/tea.md).

## Matrix federation

Multi-machine, cross-project tribe coordination. Out of scope today — a tribe instance is per-project-root and per-machine. The composition pattern doesn't preclude federation; nothing has been built.

- Tracked in: `km-tribe.matrix-shape`.
- Today: tribe is per-machine; cross-machine coordination is explicitly out of scope (see [hub/architecture.md](./architecture.md) Open questions §4).

## withMCPServer alternative surfaces

`withMCPServer()` ships today and exposes the protocol-agnostic tool registry over MCP. REST, raw JSON-RPC, gRPC, or future agent-protocol surfaces would consume the same registry following the same shape. None are built; they would be added when a real consumer needs them.

- No bead — speculative until a consumer appears.
- See: [hub/composition.md](./composition.md) "Tool registry — the load-bearing decoupling" for why the registry is protocol-agnostic.

## Per-namespace file routing in loggily

`addWriter(createFileWriter(path))` exists; per-pane / per-agent automatic file split (e.g., one file per loggily namespace) is a possible future ergonomic. Not committed.

- No bead — speculative.
- Today: host apps wire one or more writers explicitly at startup; namespace IS the separator inside a single stream.

## km + silvercode convergence options

km and silvercode are converging into one agentic workdesk — an integrated knowledge environment where the durable knowledge graph (km) and the live agent workspace (silvercode) share the same state, the same UI shell, and the same coordination layer. Today they're separate apps mostly because their MVPs landed on different timelines; the design assumption is tight integration.

What that looks like, per the [km vision](./km/design/vision.md) and the [silvercode MVP brief](./silvery/future/ai-terminal/00-agent-workspace.md):

- **km** already frames itself as *"the environment for knowledge work with AI agents"* — three first-class axes: Knowledge, Communication, Agents. The Agents axis is the silvercode shape, lifted out as a separate codebase for now.
- **silvercode**'s MVP is "agent workspace, not super-shell" — supervision/replay/memory layers around Claude Code. Naturally fed by, and feeding back into, the durable knowledge graph km already owns.
- **tribe** is built per-project precisely because both products want it to be — coordination is a layer they share rather than each rebuilding.

**Open product question** — only resolved if/when we ship to anyone outside Bjørn's daily workflow:

- Does silvercode merge into km as the Agents axis, with one app shipping?
- Does silvercode stay standalone for users who only want agent supervision?
- Or both, with the integrated km+silvercode binary as the headline product and the standalone silvercode as a slimmer companion?

The composition pattern keeps all three options open: the same `pipe + with*` factories that build them today can be re-composed into any of those product shapes without architectural surgery.

- No bead — product question, not engineering work.
- See also: [hub/roadmap.md](./roadmap.md), [hub/km/design/vision.md](./km/design/vision.md), [hub/silvery/future/ai-terminal/00-agent-workspace.md](./silvery/future/ai-terminal/00-agent-workspace.md).

## Signal-store API

`alien-signals` is shipped and used directly by plugins (each plugin imports `alien-signals` and exposes signals on its slice of the daemon value). A cross-plugin signal-store API is being designed — the open question is whether plugins announce signals on a shared registry or compose by typed slices. Pending the TEA outer-bus shape.

- Tracked in: `km-silvery.tea` (the signal-store shape is coupled to the dispatch/apply contract).
- Today: plugins reach for `alien-signals` themselves; no shared registry.

## Plugin/factory abstractions explicitly rejected

Three abstractions were considered during the 2026-04-27 retrospective and explicitly rejected (or deferred). Documented here so future sessions don't reinvent them.

### `withMachines(...)` registry layer

Considered: a `withMachines({ board, tree, … })` factory that accepts every domain machine and routes ops through a centralized dispatcher. Rejected because the existing pattern — plugins contribute ops directly during composition, each plugin owns when/how it consults its inner reducer — is simpler and avoids a centralized orchestration layer that adds nothing structural. The app-level `dispatch/apply` plugin bus (see TEA section above) is the intended replacement; it's a per-plugin contract, not a registry layer.

### `withSignalStore()`

Considered: a centralized signal store factory analogous to a Zustand-style global store, registered at composition time. Deferred. Today plugins import `alien-signals` directly and expose signals on their own slice of the daemon value. A shared store would be motivated only if plugins need to share derived state across slices; until that need is concrete, deferring avoids designing the wrong API.

### `withSurfaces(...)`

Considered: a `withSurfaces({ mcp, rest, json-rpc })` factory that registers all wire surfaces in one call. Rejected because each surface (today: only `withMCPServer()`) has its own composition prerequisites (depends on dispatcher, registry, etc.) and a one-shot registration loses the type-driven prerequisite checking that makes the `pipe + with*` pattern self-documenting. New surfaces will be added as individual `withX` factories.

- No beads — these are decisions, not work.
- The retrospective context: phantom obligations crept in when previous docs implied these abstractions existed; the rejection here closes the loop.

## See also

- [hub/architecture.md](./architecture.md) — what's shipped today.
- [hub/composition.md](./composition.md) — how shipped pieces compose.
- 2026-04-27 retrospective — the editorial-drift incidents that motivated the split.
