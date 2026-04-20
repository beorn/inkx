# km Vision — the environment for knowledge work with AI agents

**Status**: Vision document, drafted 2026-04-19. Informs all downstream design including `tribe-matrix.md` (the communication layer implementation).
**Audience**: future contributors, designers, and the AI agents that will help build km.
**Principles**: aligned with [`docs/principles.md`](../../../docs/principles.md). Plain domain language, composable pieces, MECE domain boundaries, fail loud, no feature-flag soup.

## What km is becoming

km is evolving from a knowledge TUI into **the environment for knowledge work with AI agents**. Three orthogonal axes, composed into one system:

1. **Knowledge** — durable structured information (notes, tasks, calendars, issues, research, decisions). The knowledge graph. What km has always been.
2. **Communication** — live conversation between agents and humans. Ambient coordination, directed messages, observability. Rooms where agents and humans talk.
3. **Agents** — the workers. Personas with missions and memory, sessions that assume those personas, sub-agents that spawn for scoped tasks. The doers.

Each axis is a first-class citizen. None are layered as optional add-ons. Together they form a single coherent tool where a person and their AI agents **share the same workspace, see the same state, and talk to each other** — across projects, across machines, across time.

This is not a product for shipping to strangers. It's the workspace **Bjørn's AI-assisted work** runs in. Everything else follows from that.

## The three domains, MECE

### 1. Knowledge (km's historical core)

The durable tree. Markdown files on disk, backed by a km-storage layer with SQLite state cache + FTS5 index. Governed by a handful of domain objects:

- **KNode** — the universal tree node (notes, tasks, calendar events, issues, bead items — all the same shape, positional role determined by tree location).
- **Vault** — a tree of KNodes anchored in a filesystem directory.
- **Board** — a specialized projection of a subtree (kanban, outline, tabs, channel).
- **Link** — typed relations between KNodes (wikilinks, bead dependencies, mentions).
- **Parser/Storage** — bidirectional markdown↔KNode translation.

km bd is the durable work ledger. Issue tracking expressed as KNodes with task frontmatter. Replaces external `beads` over time.

Recall is the knowledge retrieval layer. FTS5 + LLM planner/agent, indexing everything under the vault.

**Facets — km's type system.** Nodes don't have a rigid "type"; they wear **facets** — optional schemaed bundles of frontmatter that add capabilities. A node may have a `task` facet (from `km-beads`), a `room` facet (from the Communication axis), a `persona` facet (from the Agents axis), a `namespace` facet (for short-ID minting), or combinations (e.g., a bead with its own discussion thread has both `task` and `room` facets). Today the pattern is informal — ad-hoc frontmatter keys recognised by specific packages. Formalization (schema registry, validation, typed query, render dispatch) is planned in `km-infra.facet-system` and will follow once a second or third new facet type forces it.

**Names are identity.** `KNode.name` carries the user-facing identifier. When a node's name is a short, stable form (`TUI-47`, `#design`, `@alice`), the short-id-vs-name distinction disappears — the `name` IS the short id. Wikilinks `[[TUI-47]]`, `[[#design]]`, `[[@alice]]` all resolve via name lookup. Sigils (`#`, `@`) are naming conventions, not type markers.

**The knowledge layer's north star**: every decision, conversation, task, and artifact ends up structured, searchable, and linkable. Nothing is lost.

### 2. Communication (the new axis)

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

**The communication layer's north star**: every signal between agents (and between agents and humans) flows through a visible, persistable, bridgeable channel. No hidden pipes.

### 3. Agents (personas + sessions)

Who's doing the work, separately from who's *currently* doing it.

Domain objects:

- **Persona** — a durable identity. `agents/<name>.md` with `persona_id`, mission, skills, working memory, relationships. Survives restarts, changes of machine, changes of underlying AI tool.
- **Session** — a running Claude Code (or other agent) process that has *assumed* a persona. Ephemeral. Coordinated across machines via a lease.
- **Role** — a capability-bearing claim on a persona, scoped to a room (e.g., chief-in-#silvery). Role leases are separate from persona leases.
- **User** — a human participant. Mirrored as `users/<name>.md` with the same shape as personas.

Personas are the agents the human thinks about ("silvery-refactor is working on the output bug"). Sessions are the mechanical instantiations (`sess_abc123` on beorn-laptop). Roles are what a persona is authorized to do in a given context.

Agents can spawn agents. A chief can create a new persona (`km agent create omnibox-fix --focus=...`) and a worker session assumes it in a worktree. The coordination happens in rooms; the work happens in code + beads.

**The agent layer's north star**: every agent has a stable identity, a coherent mission, and persistent memory across the sessions that embody it. Agents are collaborators with continuity, not stateless tools.

## How the three compose

```
                      ┌───────────────────────────────┐
                      │         Communication         │
                      │   rooms / channels / events   │
                      │  ┌─────┐  ┌─────┐  ┌─────┐    │
                      │  │#gen │  │#des │  │@DM  │    │
                      │  └─────┘  └─────┘  └─────┘    │
                      └──────────────┬────────────────┘
                                     │
           observes / posts / coordinates via
                                     │
                  ┌──────────────────┴──────────────────┐
                  │                                     │
      ┌───────────▼──────────┐              ┌───────────▼──────────┐
      │       Agents         │              │       Knowledge      │
      │  persona + session   │  reads/writes│  KNodes / beads /    │
      │  + role + user       │──────────────│  recall / links      │
      └──────────────────────┘              └──────────────────────┘
                  │                                     │
                  └─────── share a workspace ───────────┘
                          km repo = the locus
```

**Workflow example (one day's work)**:

1. Beorn opens Claude Code in `~/Code/pim/km`. Session assumes persona `silvery-refactor` via the lease mechanism. Matrix user `@silvery-refactor` comes online.
2. `silvery-refactor` announces in `#silvery`: "picking up km-silvery.backdrop-fade from chief".
3. chief persona (held on another machine or another session) sees the claim, acknowledges in thread.
4. `silvery-refactor` works — reads recall for similar prior bugs, edits code, commits. Each significant action posts a structured event to `#silvery` (`m.km.bead.progress`).
5. Beorn on his phone, in Element, sees "silvery-refactor: landed backdrop-fade fix (commit a12dc91), tests green."
6. Session ends. Lease released. Persona's working-memory file gets appended with the summary. Recall re-indexes. Bead closes.
7. Tomorrow, a different session assumes `silvery-refactor` again. It loads the working-memory file, sees what was done, picks up the next item.

The three layers work together: **knowledge provides context, communication provides ambient coordination, agents do the work**. Each knows about the other two but doesn't absorb them.

## Design principles for each axis

Following `docs/principles.md`, each axis has specific patterns:

### Knowledge: durable, structured, searchable
- **Single tree, polymorphic nodes**: KNode's positional role keeps the type system simple.
- **Markdown as source of truth**: files are editable, git-trackable, human-readable.
- **Every artifact links**: wikilinks, bead refs, mentions — all typed relations.
- **Recall indexes everything**: FTS5 + LLM retrieval is the universal query.

### Communication: event-log core, rendered projections
- **Rooms are event logs**, not chat apps. Small core interface, capabilities for optional features.
- **Events are immutable**; edits and redactions are new events that reference prior ones.
- **Files are projections**, not editable source. Posting goes through the `Room` API.
- **Adapters are pluggable**; Matrix is the production default but not the only path.
- **Every structured event** is also a human-readable message. Plain clients render text; km-aware clients act on the structure.

### Agents: durable identity, ephemeral sessions
- **Persona = identity**, Session = process, Role = scoped claim. Three axes, not conflated.
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

### Communication (phased via [`tribe-matrix.md`](tribe-matrix.md))
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
- **Not a multi-user chat product.** The communication layer is for one human + their agents, with optional light collaboration via Matrix federation.
- **Not a workflow orchestration engine.** Top-down orchestration (Temporal, Ray, AutoGen) is explicitly wrong for this shape; bottom-up peer coordination is the design.
- **Not a replacement for beads-as-an-open-standard.** km bd is a compatible alternative backed by km's own data; beads remains an option.
- **Not a custom protocol.** The communication substrate is Matrix (or whatever adapter); we don't invent wires.
- **Not a distributed systems toolkit.** We accept single-homeserver, user-scoped, advisory-exclusivity-with-leases. No consensus protocols, no CRDTs, no federation-first design.
- **Not a lease-queuing or lease-priority system.** A role or persona lease is held or not held. Handoff is an explicit post, not a scheduler decision. If we ever need queuing, that's a signal we're off-design (drifting toward workflow engine).

## Open questions for the vision

These are aspirational threads that don't need to be answered now but should be tracked:

1. **Knowledge + Communication bidirectional**: when a structured event is posted to a room, does it also auto-create or auto-update a KNode? If yes, where? If not, how do agents search old conversations?
2. **Persona portability across AI tools**: if Cursor and Claude Code both assume the same persona, what's shared (working memory) vs what isn't (tool-specific caches)?
3. **Multi-human collaboration**: how do I invite another human to my tribe space such that their agents and mine coordinate? Matrix federation solves the protocol side; what does the UX look like?
4. **Long-term memory vs working memory**: when does a persona's working memory get compacted? Automatically by recall? Explicitly via a `km agent compact` command? Never (always-append)?
5. **Knowledge as context vs knowledge as product**: km is used personally today. Could a team use it? A small company? What breaks at scale? (Probably everything, but documenting what first would break is useful.)

## Relationship to principles.md

This vision aligns with the principles:

- **Plain domain language**: Knowledge / Communication / Agents. Each word means exactly what it says.
- **Domain object inventory**: KNode, Vault, Board, Link, Room, Event, Channel, Persona, Session, Role, User. Three domains, ~11 objects. MECE. (Space is a topology convention, not a domain object.)
- **Composable pieces**: Room (abstract) + adapter (concrete); Persona + Session; KNode + Board projection. Every complex thing is composed from simpler things with clean interfaces.
- **Fail loud**: lease violations are explicit errors; adapter capability mismatches throw (or gracefully degrade per capability check, never silent).
- **MECE**: Knowledge is what you remember; Communication is what you're saying now; Agents are who's speaking. No overlaps.
- **One obvious way**: posting goes through `Room.send()`; identity lives in a persona file; work is tracked in beads. No mode switches, no feature flags.
- **Research first for foundational features**: the communication layer went through 2 pro reviews + 2 deep research surveys + 6 alternative scans before committing. Pattern followed.

## This document's role

This is the **north star for km's direction**. When a question arises — "should feature X live in km?" — the answer comes from: "does it fit Knowledge, Communication, or Agents?" If it fits none cleanly, it probably belongs in a different project (pam, recall, silvery, etc.) or not at all.

The document itself should age well. Specific implementation details (Matrix version, adapter count, phase dates) live in the downstream design docs (tribe-matrix.md primarily). This document articulates the shape; the shape shouldn't change often.

## Downstream docs

- **Communication layer**: [`tribe-matrix.md`](tribe-matrix.md) — the concrete implementation design.
- **Historical architecture**: [`docs/architecture.md`](../../../docs/architecture.md) — the knowledge layer's current implementation.
- **Principles**: [`docs/principles.md`](../../../docs/principles.md) — the guidelines that govern all of the above.
- **Convergence with other projects**: [`hub/km/gbrain-pam-convergence.md`](../gbrain-pam-convergence.md) — how km relates to adjacent systems.

Other downstream design docs to be written as the work proceeds: agent-personas.md (expanding Phase 2), channel-view.md (expanding Phase 3, silvery work), bead-threading.md (expanding Phase 4).
