# km Vision — the environment for knowledge work with AI agents

**Status**: Vision document, drafted 2026-04-19. Informs all downstream design including `tribe-matrix.md` (the communication layer implementation).
**Audience**: future contributors, designers, and the AI agents that will help build km.
**Principles**: aligned with [`docs/principles.md`](../../../docs/principles.md). Plain domain language, composable pieces, MECE domain boundaries, fail loud, no feature-flag soup.

## What km is becoming

km is evolving from a knowledge TUI into **the workspace for agentic knowledge work — including coding**. As the README puts it: AI can finally think; now it needs a place to work. km is that place. A workspace is more than a UI — it's where the artifacts live, where the surfaces render, and where humans and agents actually operate side by side. km holds the substrate; tribe carries the live coordination across it; participants do the work.

1. **km — the workspace.** Durable, structured, queryable, big-picture, *and active*. Notes, tasks, calendars, issues, research, decisions, **plans of any shape** (roadmaps, kanbans with dependencies, autonomous-dispatch boards), persona working memory, agent-pane sessions, recall results — plus the surfaces that render them (board views, silvercode coding panes, tribe-room views, search palettes, journals). Everything you do during agentic knowledge work happens inside km. silvercode is the *coding-flavored* surface of the workspace; km-tui is the *board / notes / calendar* surface; both render through silvery and share the same substrate (beads, recall, tribe, personas). km is not just where you look — it's where you *work*.
2. **tribe — the coordination substrate.** Live, ephemeral, peer. Rooms where agents and humans talk; structured events; persona/role leases; ambient signals. Bottom-up coordination, observability into who's doing what right now. tribe runs *across* the workspace, not above it.
3. **Agents as participants.** Personas with missions and memory (durable in km), sessions that assume those personas (live in tribe), sub-agents that spawn for scoped tasks. They read km for context and plans, act in tribe rooms, write outcomes back to km. Agent panes (silvercode) are participants embodied in the workspace.

Each is a first-class citizen. Together they form a single coherent workspace where a person and their AI agents **share the same place, see the same state, talk to each other, and operate side by side** — across projects, across machines, across time. Coding is not a separate product; it's one of the things you do inside this workspace, sitting next to your tasks, your notes, your meeting prep, and your daily journal.

**km hosts both planning postures.** Top-down (a roadmap, a dep-graph kanban, a Symphony-shape autonomous-dispatch board) and bottom-up (peers claim work, ambient coordination in tribe rooms) are both valid ways the workspace operates. The constraint is that **plans are data in km, not policy in the runtime** — km stores the artifact; tribe + agent personas execute against it; outcomes update the artifact. km does not embed a scheduler, priority queue, or workflow engine — but it happily hosts the data those things produce and consume, and renders the result.

This is not a product for shipping to strangers. It's the workspace **Bjørn's AI-assisted work** runs in. Everything else follows from that.

## The workspace, the substrate, the participants — MECE

### 1. km — the workspace (km's historical core, expanded)

The durable tree. Markdown files on disk, backed by a km-storage layer with SQLite state cache + FTS5 index. Governed by a handful of domain objects:

- **KNode** — the universal tree node (notes, tasks, calendar events, issues, bead items — all the same shape, positional role determined by tree location).
- **Vault** — a tree of KNodes anchored in a filesystem directory.
- **Board** — a specialized projection of a subtree (kanban, outline, tabs, channel).
- **Link** — typed relations between KNodes (wikilinks, bead dependencies, mentions).
- **Parser/Storage** — bidirectional markdown↔KNode translation.

km bd is the durable work ledger. Issue tracking expressed as KNodes with task frontmatter. Replaces external `beads` over time.

Recall is the knowledge retrieval layer. FTS5 + LLM planner/agent, indexing everything under the vault.

**Facets — km's type system.** Nodes don't have a rigid "type"; they wear **facets** — optional schemaed bundles of frontmatter that add capabilities. A node may have a `task` facet (from `km-beads`), a `room` facet (linking to a tribe channel), a `persona` facet (durable agent identity), a `workflow` facet (a `WORKFLOW.md`-shaped dispatch contract), a `namespace` facet (for short-ID minting), or combinations (e.g., a bead with its own discussion thread has both `task` and `room` facets). Today the pattern is informal — ad-hoc frontmatter keys recognised by specific packages. Formalization (schema registry, validation, typed query, render dispatch) is planned in `km-infra.facet-system` and will follow once a second or third new facet type forces it.

**Names are identity.** `KNode.name` carries the user-facing identifier. When a node's name is a short, stable form (`TUI-47`, `#design`, `@alice`), the short-id-vs-name distinction disappears — the `name` IS the short id. Wikilinks `[[TUI-47]]`, `[[#design]]`, `[[@alice]]` all resolve via name lookup. Sigils (`#`, `@`) are naming conventions, not type markers.

**Plans are KNodes too.** A roadmap is a tree of milestones. A kanban is a board projection over beads. A dep-graph is a set of typed `Link` relations. A Symphony-style autonomous-dispatch board is a subtree of beads with a workflow facet plus a `WORKFLOW.md`-shaped node defining the prompt and runtime contract. None of these need new infrastructure — they're shapes the existing knowledge primitives already express.

**Surfaces are part of the workspace.** Boards, silvercode coding panes, tribe-room views, recall search palettes, daily journals — all render through silvery and share the same substrate. The workspace isn't a backend that surfaces happen to read; the surfaces are the workspace's working faces. silvercode and km-tui aren't two products; they're two flavors of one workspace.

**The workspace's north star**: every decision, conversation, task, plan, agent action, and artifact ends up structured, searchable, linkable, and renderable as a big-picture view. Nothing is lost. Nothing is hidden behind a runtime. The work happens here.

### 2. tribe — the coordination substrate

Real-time conversation, channeled. Implemented via Matrix as a substrate with adapter-pluggable architecture. See [`tribe-matrix.md`](tribe-matrix.md) for the detailed design.

Domain objects:

- **Room** — an event-log abstraction. Rooms carry broadcasts, directs, structured events. Adapters (`room-matrix`, `room-file`, `room-xmpp`, etc.) plug in behind the same interface.
- **Channel** — a named Room within a km repo.
- **Event** — an immutable, relatable atom. Messages, edits (as new events referencing originals), reactions, structured events, lifecycle events.

Rooms split into two **classes** by durability posture:

- **durable rooms** — long-lived, committed to git, part of the project's history. #design, #silvery, quarterly retros. Live under `com/rooms/` on disk.
- **ephemeral chats** — short-lived, gitignored by default. Daily hellos, quick side-coordination, standup notes. Live under `com/chats/` on disk.

Same wire, same `Room` interface, same Matrix substrate — different persistence posture. Location on disk encodes the policy; no per-room flags. A chat can be promoted to a room (`km room promote <chat>`) when it turns out to matter long-term.

**Space** is a topology convention (km repo ↔ Matrix space when the `spaces` capability is available), not a domain object. km's topology layer uses it when adapters support it; falls back to flat `<repo-id>/<channel>` naming otherwise.

km repos are mapped to matrix spaces. Rooms and chats are members of those spaces. Agents and humans are members of individual rooms. History is projected as files under `com/rooms/<channel>/` or `com/chats/<channel>/` on disk — rendered, not editable-source. The `com/` directory is a filesystem materialization convention; the canonical domain term for the thing it holds is a **Channel** (a named Room).

Observability: Element (matrix client) on phone, desktop, web reads the rooms. Your agents' conversations become readable from anywhere.

**The tribe layer's north star**: every signal between agents (and between agents and humans) flows through a visible, persistable, bridgeable channel. No hidden pipes. Coordination is bottom-up by default; top-down execution (a daemon dispatching work from a km board) is just a particular shape of participant — it claims leases and posts events like any other peer.

### 3. Agents — participants that bridge km and tribe

Who's doing the work, separately from who's *currently* doing it. Agents read km for context and plans, act in tribe rooms (claims, broadcasts, handoffs), and write outcomes back to km.

Domain objects:

- **Persona** — a durable identity. `agents/<name>.md` with `persona_id`, mission, skills, working memory, relationships. Survives restarts, changes of machine, changes of underlying AI tool.
- **Session** — a running Claude Code (or other agent) process that has *assumed* a persona. Ephemeral. Coordinated across machines via a lease.
- **Role** — a capability-bearing claim on a persona, scoped to a room (e.g., chief-in-#silvery). Role leases are separate from persona leases.
- **User** — a human participant. Mirrored as `users/<name>.md` with the same shape as personas.

Personas are the agents the human thinks about ("silvery-refactor is working on the output bug"). Sessions are the mechanical instantiations (`sess_abc123` on beorn-laptop). Roles are what a persona is authorized to do in a given context.

Agents can spawn agents. A chief can create a new persona (`km agent create omnibox-fix --focus=...`) and a worker session assumes it in a worktree. The coordination happens in rooms; the work happens in code + beads.

**The participant layer's north star**: every agent has a stable identity, a coherent mission, and persistent memory across the sessions that embody it. Agents are collaborators with continuity, not stateless tools. Persona files are durable km artifacts; sessions and leases are live tribe state.

## Planning postures: km supports both

km is **posture-agnostic**. The same primitives express:

- **Top-down planning**: a quarterly roadmap as a tree of milestones; a kanban with explicit `blocks` dependencies; an autonomous-dispatch board where a daemon (Symphony-shape, kanban-hooks-shape, or homegrown) reads `km bd ready` and spawns workers; a `WORKFLOW.md`-style node carrying the dispatch contract.
- **Bottom-up coordination**: peers claim leases in tribe rooms; ambient broadcasts flow through `[AMBIENT — observation]` channels; handoff is an explicit post; recall surfaces prior context as personas pick up work.

**The same bead can participate in both postures simultaneously.** A daemon may dispatch it; a human may reassign it; a peer may claim it; ambient activity may inform it. The bead is the artifact; the posture is the rendering.

What km does *not* do:

- **Run a scheduler.** km does not pick what runs next; it stores plans that schedulers (or humans, or peer agents) read.
- **Enforce priority queues.** km can render priority and dependencies; participants negotiate execution.
- **Embed workflow runtime.** No Temporal-style state machine, no Ray-style task graph executor. If a participant wants those semantics, they bring their own runtime and read km as data.

This is the line: **plans are data, not policy.** km hosts the plan; tribe + agents execute against it; outcomes update the plan. The km↔tribe split keeps the durable surface clean and the runtime substitutable.

## How the layers compose

```
km repo = the locus
├── km — the durable surface
│   ├── KNodes (notes, beads, calendars, decisions)
│   ├── Plans (roadmaps, kanban projections, dep-graphs, workflow contracts)
│   ├── Persona files (agents/<name>.md — mission, working memory)
│   └── Recall index (FTS5 + LLM retrieval over the above)
│
├── tribe — the live substrate
│   ├── Rooms / channels / events (durable + ephemeral)
│   ├── Leases (persona, role)
│   ├── Ambient signal (CI, recall, peer broadcasts)
│   └── Structured events that link back to km artifacts
│
└── Participants — agents and humans
    ├── Read km: context, plans, persona memory
    ├── Act in tribe: claim leases, post events, broadcast
    └── Write back to km: outcomes, decisions, working-memory deltas
```

**Workflow example (one day's work)**:

1. Beorn opens Claude Code in `~/Code/pim/km`. Session assumes persona `silvery-refactor` via the lease mechanism. Matrix user `@silvery-refactor` comes online.
2. `silvery-refactor` announces in `#silvery`: "picking up km-silvery.backdrop-fade from chief".
3. chief persona (held on another machine or another session) sees the claim, acknowledges in thread.
4. `silvery-refactor` works — reads recall for similar prior bugs, edits code, commits. Each significant action posts a structured event to `#silvery` (`m.km.bead.progress`).
5. Beorn on his phone, in Element, sees "silvery-refactor: landed backdrop-fade fix (commit a12dc91), tests green."
6. Session ends. Lease released. Persona's working-memory file gets appended with the summary. Recall re-indexes. Bead closes.
7. Tomorrow, a different session assumes `silvery-refactor` again. It loads the working-memory file, sees what was done, picks up the next item.

The pieces work together: **km is the workspace where durable artifacts live and surfaces render, tribe is the coordination substrate flowing across it, agents are the participants doing the work**. The workspace contains everything; the substrate connects it; the participants act inside it.

## Design principles for each layer

Following `docs/principles.md`, each layer has specific patterns:

### km: durable, structured, searchable, posture-agnostic

- **Single tree, polymorphic nodes**: KNode's positional role keeps the type system simple.
- **Markdown as source of truth**: files are editable, git-trackable, human-readable.
- **Every artifact links**: wikilinks, bead refs, mentions — all typed relations.
- **Recall indexes everything**: FTS5 + LLM retrieval is the universal query.
- **Plans are nodes**: roadmaps, kanbans, workflow contracts are KNodes with facets, not new infrastructure. Top-down posture is opt-in per board, not a global mode.

### tribe: event-log core, rendered projections

- **Rooms are event logs**, not chat apps. Small core interface, capabilities for optional features.
- **Events are immutable**; edits and redactions are new events that reference prior ones.
- **Files are projections**, not editable source. Posting goes through the `Room` API.
- **Adapters are pluggable**; Matrix is the production default but not the only path.
- **Every structured event** is also a human-readable message. Plain clients render text; km-aware clients act on the structure.

### Agents: durable identity, ephemeral sessions

- **Persona = identity**, Session = process, Role = scoped claim. Three concerns, not conflated. Persona files live in km; sessions and leases live in tribe.
- **Stable `persona_id`** distinct from filename; rename preserves identity.
- **Lease-based exclusivity** (or explicit advisory-only) — never silent "who holds this."
- **Working memory is append-only** in the durable file; volatile runtime state is separate and gitignored.
- **Hard delete is unusual**; archive/tombstone preserves history.
- **Roles are leases too** — chief, observer, etc. All coordination state externalized.

## Integration with the wider ecosystem

### Claude Code

km's primary runtime. Sessions assume personas via SessionStart hook. MCP tools exposed for tribe (broadcast, send, members, history, recall, bd operations). Claude Code is the interactive shell; km is the workspace it shells into.

### @bearly/recall

The search primitive. Indexes vault files including rendered `chats/`, persona working memory, bead descriptions. Invoked as `bun recall "query"` from CLI or as a tribe MCP tool.

### bearlymade (alien-signals, alien-trees, alien-projections, alien-resources)

km's reactive primitives. Used throughout km-tui, km-board, km-storage. No change from vision; continues as-is.

### silvery

km's TUI framework. Gets a new **channel view type** for rendering `chats/` directories (see `tribe-matrix.md`). No other fundamental changes; silvery remains general-purpose.

### bd / km bd

Work ledger. External `beads` in use today; km-native `km bd` backed by km-storage is the destination (`km-infra.bd-v1-compat`). Tribe references bead IDs in structured events; bead claims can auto-create threads in the relevant channel.

### OpenClaw

Future bridge only. When km user wants cross-platform reach (chat from Slack, Telegram, iMessage, etc. arrives in the same tribe rooms), `@bearly/room-openclaw` adapter provides it. No dependency today; commitment avoided per the trust-surface analysis in `tribe-matrix.md`.

### pam (Personal Assistant Machine)

Adjacent project. pam and km share philosophy but different shapes — pam is the conversational personal-assistant product; km is the knowledge-work-environment product. They can be bridged via tribe (a pam agent becomes a persona in a km tribe room) but are not merged.

### gbrain-pam convergence

See `hub/km/gbrain-pam-convergence.md`. The takeaways — RESOLVER.md, compiled-truth/timeline, enrichment tiers, hybrid search — inform the knowledge-layer vision here. km adopts those patterns gradually; vector search integration is a Phase 5+ concern.

## Roadmap

Aligned with how each domain advances; phased rollout in the DR for communication is the active work.

### Knowledge (ongoing)

- km bd feature parity with external beads (`km-infra.bd-v1-compat`, in progress)
- Vector search integration into km-storage (future)
- RESOLVER.md + compiled-truth patterns adopted from gbrain (future)

### tribe (phased via [`tribe-matrix.md`](tribe-matrix.md))

- **Phase 0**: `@bearly/room` interface + minimal adapters + chaos conformance (5-6d)
- **Phase 1**: Matrix adapter + homeserver install (4-5d)
- **Phase 2**: Personas + session assumption + lease mechanism (3-5d)
- **Phase 3**: Silvery channel view type (1-2w)
- **Phase 4**: Structured events + bead threading (1w)
- **Phase 5+**: E2E, OpenClaw bridge, federation, per-room class policies

### Agents (parallel to communication phases)

- **Phase 2 (from tribe)**: persona files, session assumption, lease, `km agent` CLI
- **Phase 3**: personas integrated into silvery (render in channel view; profile pages)
- **Phase 4**: agent spawning integrated with `bun worktree` for scoped sub-agents
- **Future**: agent skill libraries, persona composition ("silvery-refactor" inherits from "coder-persona"), multi-AI-tool support (Cursor session can assume a persona created by Claude Code)

## The big-picture commitments

These are the "what we're NOT doing" items that keep the vision focused:

- **Not a SaaS product.** km is self-hostable by design; no cloud dependency.
- **Not a multi-user chat product.** tribe is for one human + their agents, with optional light collaboration via Matrix federation.
- **Plans are data, not policy.** km hosts plans of any shape — top-down (kanbans with deps, roadmaps, autonomous-dispatch boards, Symphony-style workflow contracts) and bottom-up (claim queues, ambient coordination state). The runtime that *executes* a plan lives in tribe + agent personas + (optionally) external schedulers that read km as data — not in km itself. This is the line between hosting orchestration content and being an orchestration engine.
- **No scheduler runtime embedded in km.** No Temporal-style state machine, no Ray-style task graph, no AutoGen-style agent loop baked into the storage layer. If a participant wants those semantics, they bring their own runtime and read km as data. km can render priority and dependencies; participants negotiate execution.
- **Lease is a flag, not a queue.** A role or persona lease is held or not held. Handoff is an explicit post in tribe. km doesn't run a scheduler that picks who gets a lease next — but a board may render a queue, a daemon may dispatch from one, and a human may override either. The constraint is: km doesn't *enforce* execution order; it *displays* whatever order participants negotiate.
- **Not a replacement for beads-as-an-open-standard.** km bd is a compatible alternative backed by km's own data; beads remains an option.
- **Not a custom protocol.** The tribe substrate is Matrix (or whatever adapter); we don't invent wires.
- **Not a distributed systems toolkit.** We accept single-homeserver, user-scoped, advisory-exclusivity-with-leases. No consensus protocols, no CRDTs, no federation-first design.

## Open questions for the vision

These are aspirational threads that don't need to be answered now but should be tracked:

1. **km ↔ tribe bidirectional**: when a structured event is posted to a tribe room, does it also auto-create or auto-update a KNode? If yes, where? If not, how do agents search old conversations?
2. **Persona portability across AI tools**: if Cursor and Claude Code both assume the same persona, what's shared (working memory) vs what isn't (tool-specific caches)?
3. **Multi-human collaboration**: how do I invite another human to my tribe space such that their agents and mine coordinate? Matrix federation solves the protocol side; what does the UX look like?
4. **Long-term memory vs working memory**: when does a persona's working memory get compacted? Automatically by recall? Explicitly via a `km agent compact` command? Never (always-append)?
5. **Knowledge as context vs knowledge as product**: km is used personally today. Could a team use it? A small company? What breaks at scale? (Probably everything, but documenting what first would break is useful.)

## Relationship to principles.md

This vision aligns with the principles:

- **Plain domain language**: km / tribe / participants. Each word means exactly what it says.
- **Domain object inventory**: KNode, Vault, Board, Link, Plan-as-KNode (with `workflow` / `roadmap` / `kanban` facets), Room, Event, Channel, Persona, Session, Role, User. Workspace + substrate + participants, ~12 objects. MECE. (Space is a topology convention, not a domain object.)
- **Composable pieces**: Room (abstract) + adapter (concrete); Persona + Session; KNode + Board projection. Every complex thing is composed from simpler things with clean interfaces.
- **Fail loud**: lease violations are explicit errors; adapter capability mismatches throw (or gracefully degrade per capability check, never silent).
- **MECE**: km is the workspace — durable artifacts plus the surfaces that render them (what you remember, what's planned, what's being coded right now in a silvercode pane, what's coming through tribe); tribe is the live coordination substrate (what's being said between participants right now); participants are who's doing the work. No overlaps.
- **One obvious way**: posting goes through `Room.send()`; identity lives in a persona file; work is tracked in beads. No mode switches, no feature flags.
- **Research first for foundational features**: the communication layer went through 2 pro reviews + 2 deep research surveys + 6 alternative scans before committing. Pattern followed.

## This document's role

This is the **north star for km's direction**. When a question arises — "should feature X live in km?" — the answer comes from: "is it a durable artifact (km), a live coordination signal (tribe), or a participant capability (agent personas)? And does it stay on the right side of the data-vs-policy line?" If it fits none cleanly, it probably belongs in a different project (pam, recall, silvery, etc.) or not at all.

The document itself should age well. Specific implementation details (Matrix version, adapter count, phase dates) live in the downstream design docs (tribe-matrix.md primarily). This document articulates the shape; the shape shouldn't change often.

## Downstream docs

- **The integrated workdesk (canonical future plan)**: [`integrated-workdesk.md`](integrated-workdesk.md) — drafted 2026-04-27. Synthesizes vision + silvercode squad mode + agentroom gateway + tribe-matrix into one cross-layer execution plan. Read this immediately after vision.md.
- **tribe (coordination substrate)**: [`tribe-matrix.md`](tribe-matrix.md) — the concrete implementation design.
- **km architecture (plan + knowledge surface)**: [`docs/architecture.md`](../../../docs/architecture.md) — the durable layer's current implementation.
- **Principles**: [`docs/principles.md`](../../../docs/principles.md) — the guidelines that govern all of the above.
- **Convergence with other projects**: [`hub/km/gbrain-pam-convergence.md`](../gbrain-pam-convergence.md) — how km relates to adjacent systems.

Other downstream design docs to be written as the work proceeds: agent-personas.md (expanding Phase 2), channel-view.md (expanding Phase 3, silvery work), bead-threading.md (expanding Phase 4).

