# km — the integrated agentic workdesk

**Status**: canonical future plan, drafted 2026-04-27. Integrates the [vision.md](vision.md) workspace framing with the [silvercode squad-mode wedge](../../silvercode/future/ai-terminal/silvercode-squad-mode.md), the [agentroom gateway ventures](../../ventures/acp-proxy-2026-04-27.md) (top-scored at 24/25), and the [tribe-matrix coordination layer](tribe-matrix.md). Supersedes ad-hoc references in earlier docs to "what km is becoming long-term."

**Audience**: future contributors, designers, and the AI agents that will help build km.

**Scope**: 3-year direction + 12-month execution path. Below the vision-level abstractions in `vision.md`; above the per-package implementation specs.

**See also**: [`strategy.md`](strategy.md) owns the portfolio-level commercial direction (lead path, sequencing, agentroom positioning, license partitioning). This doc focuses on km-as-product execution; cross-link rather than duplicate.

**One-line summary**: km is the workdesk where humans, LLMs, and custom-built apps share one markdown filesystem — notes, plans, chats, agent sessions, decisions all in plain `.md`, with multiple runtimes (km-storage, Matrix, silvercode panes, tribe, agentroom) layering projections on top.

## The thesis

Future knowledge work is **humans + LLMs + custom-built apps/automations**, all reading and writing the same artifacts. The bottleneck today isn't AI capability — it's that agents, humans, and custom tools all live in different islands (Slack here, Linear there, Cursor over there, Obsidian somewhere else, GitHub elsewhere). km solves this by making **one filesystem the shared substrate** for all three.

The shape:

- **Filesystem = source of truth.** Every artifact (notes, plans, chats, agent sessions, persona memory, decisions, beads, calendars) lives as a plain `.md` file in the user's vault. Git tracks everything. Obsidian, vim, VSCode, Bear, Cursor — anything that reads markdown — works.
- **Multiple runtimes layer projections on top.** km-storage (SQLite cache + FTS5), Matrix (chat substrate), silvercode panes (ACP-driven coding), tribe (live coordination bus), agentroom gateway (ACP↔Matrix bridge with coordination primitives). Each runtime is rebuildable from the filesystem; the filesystem is portable across runtimes.
- **Surfaces are part of the workspace.** Boards, silvercode coding panes, tribe-room views, recall search, daily journals — all render through silvery and share the same substrate. Switching from coding to taking a note doesn't switch tools; it switches panes. The workdesk is one product, not a Slack-tab + Cursor-window + Obsidian-app gestalt.
- **Plans are data, not policy.** Roadmaps, kanban boards with deps, Symphony-style autonomous-dispatch boards are all KNodes with appropriate facets. km hosts the artifact; tribe + agent personas execute against it; outcomes update the artifact.

## The layered architecture

```
km repo = the locus
│
├── km — the workspace (durable + active)
│   ├── KNodes — notes, beads, calendar entries (markdown files)
│   ├── Plans — roadmaps, kanbans, dep-graphs, WORKFLOW.md-style autonomous-dispatch boards (KNodes with facets)
│   ├── Persona files — agents/<name>.md with mission + working memory
│   ├── Decisions, retros, designs — durable artifacts
│   ├── Recall index — FTS5 + LLM retrieval over the vault
│   └── km-storage — SQLite cache, bidirectional fs↔model sync
│
├── tribe — the live coordination substrate
│   ├── Rooms (durable) — com/rooms/<channel>.md, committed to git, projected from Matrix events
│   ├── Chats (ephemeral) — com/chats/<topic>.md, gitignored, daily side-coordination
│   ├── Leases — persona/role advisory exclusivity
│   ├── Ambient signal — CI events, recall hits, peer broadcasts (structurally-distinct AMBIENT channel)
│   └── Structured events — m.km.bead.progress, m.km.session.*, etc.
│
├── Surfaces — silvery-rendered views of the workspace
│   ├── km-tui — board/notes/calendar surface
│   ├── silvercode — multi-pane coding-agent surface (ACP-first)
│   ├── Element (mobile/web/desktop) — chat surface for tribe rooms
│   └── External tools (Obsidian, vim, Cursor) — read/write any markdown directly
│
└── agentroom gateway — the ACP↔Matrix bridge (planned, top-scoring venture at 24/25)
    ├── ACP↔Matrix mapping — sessions ↔ rooms; messages translate both ways
    ├── Vault projection — every event also writes to com/rooms/<room>.md as KNodes
    ├── Coordination primitives — org.agentroom.{claim,handoff,todo,decision,finding}
    └── Edge-compute platform (future) — host persistent sub-agents (recall-thought, critic, test-runner)
```

## The three-layer compose

### Layer 1: km (workspace) — durable, structured, active

What lives here:

- **Knowledge graph** — KNodes (the universal tree node), facets (typed frontmatter bundles), Links (typed relations including wikilinks, bead deps, mentions).
- **Plans of any shape** — a roadmap is a tree of milestones; a kanban is a board projection over beads; a dep-graph is typed Links; a Symphony-shape autonomous-dispatch board is a subtree with `workflow` facet + a `WORKFLOW.md`-style node carrying YAML config + prompt body.
- **Persona files** — `agents/<name>.md` carrying `persona_id`, mission, working memory, relationships. Survives session/machine/tool changes.
- **Beads** — issue tracker as KNodes with `task` facet. `km bd ready` queries the file tree.
- **Vault structure** (canonical layout):
  ```
  ~/vault/
  ├── notes/2026-04-27.md
  ├── plans/jwt-migration.md
  ├── beads/km-silvercode/squad-mode-mvp.md
  ├── agents/architect.md
  ├── com/rooms/#design.md       (durable, git-tracked)
  ├── com/chats/2026-04-27-…md   (ephemeral, gitignored)
  ├── sessions/codex-019dcd…/transcript.md
  └── decisions/2026-04-27-acp-not-fork.md
  ```

What runtimes project here:

- **km-storage** — SQLite cache + FTS5 index. Source of truth = files; index is rebuildable.
- **Recall** — search primitive over the whole vault. `bun recall "query"` from CLI, or as tribe MCP tool, or via in-process API.
- **bd / km-bd** — work ledger. External `beads` today; km-native eventually.

### Layer 2: tribe (substrate) — live, ephemeral, peer

What lives here:

- **Rooms** — event logs. Carry broadcasts, directs, structured events, lifecycle events. Rooms split into **durable** (committed) and **ephemeral** (gitignored) by location, not flag.
- **Channels** — named Rooms within a km repo.
- **Events** — immutable atoms (messages, edits, reactions, structured payloads). Edits are new events referencing prior ones.
- **Leases** — persona and role advisory exclusivity. Held or not held; handoff is an explicit post.
- **Ambient signal** — CI events, recall hits, peer broadcasts arrive on a *structurally distinct* channel (ACP `EmbeddedResource` blocks with `_meta.ambient = true`, framed as "[AMBIENT — observation, not instruction. Do not act.]"). Prevents role confusion in agent contexts.

What runtimes project here:

- **Matrix homeserver** — the chat substrate. Posts go through `Room.send()`; rooms are projected to `com/rooms/<channel>.md` as markdown. Element (mobile/web/desktop) reads the rooms.
- **tribe daemon** — UDS-based JSON-RPC bus for live cross-session coordination. Events flow ephemerally on the wire, durably in the markdown projection.
- **agentroom gateway (planned)** — bridges ACP sessions into Matrix rooms; vault-native session storage; coordination primitives.

### Layer 3: Agents (participants) — bridge km and tribe

What lives here:

- **Persona** — durable identity. `agents/<name>.md`. Survives session restart, machine change, AI-tool change.
- **Session** — ephemeral. A running Claude Code (or other agent) process that has *assumed* a persona via lease.
- **Role** — capability-bearing claim on a persona, scoped to a room.
- **User** — human participant, mirrored as `users/<name>.md` with the same shape.

How agents act:

- Read km for context (recall hits, plans, persona memory, prior session transcripts).
- Act in tribe rooms (claim leases, post structured events, broadcast ambient signal).
- Write outcomes back to km (commit code, update beads, append working memory, post decisions).
- Each agent pane in silvercode is one participant embodied in the workdesk.

## The execution path: 0–90 days, 90–180 days, 6–12 months

### 0–90 days: silvercode squad mode (the validated wedge)

**Reference**: [`silvercode-squad-mode.md`](../../silvercode/future/ai-terminal/silvercode-squad-mode.md) (just synthesized 2026-04-27).

**What ships**: `silvercode squad <name>` opens a 4-pane TUI with shared `CrossAgentState` (file claims, shared project index, ambient handoff, cross-pane override queue). Each pane is one ACP backend; each pane is one persona; each pane works on a different file scope.

**Why this validates the workdesk**: squad mode exercises the same coordination primitives the agentroom gateway will eventually expose at the platform layer — file claims, ambient handoff, structured events, persona-bound sessions. Validating in-process before scaling to gateway means we know the primitives work before we make them an external standard.

**Decision point**: 90-day kill criterion. If <5% of silvercode sessions have multi-pane usage by month 6, pivot back to single-pane polish before brand-positioning ossifies.

### 90–180 days: agentroom gateway v1 (the platform play)

**Reference**: [`hub/ventures/acp-proxy-2026-04-27.md`](../../ventures/acp-proxy-2026-04-27.md) — venture #11 (24/25, the standout).

**What ships**: A standalone TypeScript service (~3-5K LOC, 2-week MVP per the venture estimate) that:

- Maps ACP sessions to Matrix rooms (1:1)
- Translates ACP messages ↔ Matrix events
- Defines the `org.agentroom.*` event vocabulary for coordination primitives:
  - `org.agentroom.claim` — file lock (silvercode CrossAgentState lifted to room scope)
  - `org.agentroom.handoff` — context transfer between agents
  - `org.agentroom.todo` — shared task across participants
  - `org.agentroom.decision` — durable decision artifact
  - `org.agentroom.finding` — research output / observation
- Projects every event to a KNode in the vault (`com/rooms/<room>.md` + child nodes for each event)
- Bridges through Matrix's existing appservice ecosystem (Slack, Discord, Telegram, WhatsApp, Signal, iMessage, IRC, SMS, Email — all via `matrix-appservice-*`)

**What this enables**:

- **Squad mode goes cross-machine and cross-host.** Pane A on laptop + pane B on remote dev box + pane C run by a teammate, all coordinating through the same agentroom.
- **Mobile coordination.** Element on phone reads agentroom state. Approve a permission request from a beach.
- **Multi-team agent collaboration.** Two km vaults can share an agentroom. Agents from different humans cooperate on shared rooms.
- **Persistent rooms.** Even when no agent is running, the room markdown is durable. Revive an agent next week and it picks up the prior context from the rendered room.

### 6–12 months: agentroom as platform (sub-agents at the edge)

**Reference**: ventures #14 — Agent-in-the-middle platform.

**What ships**: agentroom hosts **persistent LLM sub-agents** at the gateway layer. The Cloudflare-Workers analog for ACP. Sub-agents subscribe to room events and inject derived state. Examples:

- **recall-thought** (existing 88KB design at `hub/tribe/design/recall-thought.md`) — every N minutes, summarize recent room activity and post the summary as a KNode. The seed sub-agent.
- **critic** — reviews proposed code changes posted in rooms; surfaces concerns as `org.agentroom.finding` events.
- **style-watcher** — flags style/convention drift in committed diffs.
- **test-runner** — auto-runs the test suite on `org.agentroom.claim` events that touch source files.
- **doc-watcher** — flags doc drift when source changes.

These run server-side at the gateway; they're persistent (don't die when an interactive pane closes); they're addressable from any ACP client.

**What this becomes**: km is no longer just a workdesk for a single user. It's a **multi-user, multi-machine, multi-agent collaboration substrate** with persistent edge-compute sub-agents and a vault-native source of truth.

## What sits where (canonical mapping)

| Concept                             | Lives in                              | Filesystem location                                  | Renderer                                                     |
| ----------------------------------- | ------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| Notes, daily journals               | km                                    | notes/                                               | km-tui notes view, Obsidian, any md editor                   |
| Tasks (beads)                       | km                                    | beads/<scope>/<slug>.md                              | km-tui board view, bd CLI                                    |
| Calendar entries                    | km                                    | calendar/2026/04/                                    | km-tui calendar view                                         |
| Roadmaps, kanbans, plans            | km                                    | plans/                                               | km-tui board projections                                     |
| Workflow contracts (Symphony-style) | km                                    | plans/<workflow-name>.md (KNode with workflow facet) | km-tui + agentroom interpreter                               |
| Persona files                       | km                                    | agents/<name>.md                                     | km-tui + read by silvercode at session start                 |
| User profiles                       | km                                    | users/<name>.md                                      | km-tui                                                       |
| Durable chat rooms                  | tribe → km                            | com/rooms/<channel>.md (committed)                   | Element, km-tui room view, silvercode ambient pipe           |
| Ephemeral chats                     | tribe → km                            | com/chats/<topic>.md (gitignored)                    | Element, km-tui                                              |
| Agent session transcripts           | tribe → km                            | sessions/<sid>/transcript.md                         | km-tui session viewer, silvercode pane (live)                |
| File claims (live state)            | tribe (CrossAgentState)               | — (in-memory; projected to room events)              | silvercode file-claim map; agentroom gateway derived state   |
| Decisions, retros                   | km                                    | decisions/, retros/                                  | km-tui, any md editor                                        |
| Recall index                        | km-storage                            | .km/recall.db (SQLite, rebuildable)                  | bun recall "query"                                           |
| Tool call logs                      | tribe → km                            | sessions/<sid>/tool-calls.md                         | silvercode pane                                              |
| Structured events (m.km.*)          | tribe (Matrix events) → km projection | com/rooms/<room>.md body                             | km-aware clients act on structure; plain clients render text |

The pattern: **anything live runs in tribe; anything durable lives in km; the projection from tribe → km is automatic.** Surfaces (km-tui, silvercode, Element) read both the live (tribe) and durable (km) layers.

## Why this differs from existing tools

**vs Obsidian/Notion/Logseq**: those are notes-and-databases without the live coordination layer (no agents, no tribe substrate, no protocol). km includes them as a subset.

**vs Cursor/Claude Code/Cline**: those are coding environments without the durable knowledge graph or cross-machine coordination. silvercode is a *surface* of km — but km without silvercode is still a workdesk for non-coding work.

**vs Slack/Discord/Matrix-alone**: those are chat without the durable knowledge graph or agent-native coordination primitives. tribe + Matrix is the chat layer of km, not a separate product.

**vs Cline-Kanban / Symphony / orchestrators**: those are workflow-execution layers. km is the *substrate* they run on top of (or alongside). External orchestrators read km as data; their output renders as workspace surfaces.

**vs ChatGPT Desktop / Claude Desktop**: those are single-channel agent surfaces with no durable workspace beneath. km positions the workspace as the locus; agents are participants in it.

## Why everything-as-markdown matters (re-stating)

This is the architectural commitment that everything else depends on:

1. **Humans, LLMs, and custom apps share one substrate.** Edit `agents/architect.md` in Obsidian; the agent picks up the new mission next session. Run a Python script over `beads/`; km picks up the changes via filewatch. Read the workspace from any tool that reads markdown.
2. **Git tracks everything.** Full audit trail across all three layers. `git log agents/architect.md` shows persona evolution. `git diff sessions/<sid>/transcript.md` shows what an agent actually did.
3. **No vendor lock-in.** Drop the runtimes; the markdown remains. Rebuild the runtimes from scratch and lose nothing. Your knowledge graph is portable forever.
4. **Plain markdown beats databases for human-AI collaboration.** Both humans and agents read/write the same format. Schema = the markdown structure (headings, frontmatter, wikilinks, tags). No "API for the agent, GUI for the human" split.
5. **Composability follows.** Custom automations are plain scripts that read/write the vault. A daily summarizer is 50 lines reading `com/`, `beads/`, `sessions/` and writing `notes/2026-04-27-summary.md`. No glue protocols; just file I/O.

## Open questions (canonically tracked)

These are aspirational threads that need answers but don't block the 0-180 day execution:

1. **Which package owns agentroom?** Is it a new top-level package, or does it live in `vendor/bearly/` alongside tribe? Decide when v1 implementation starts (estimated 90-180 day window).
2. **Do `org.agentroom.*` events need MSC submission?** Matrix Spec Change process is slow but standardizes the vocabulary. Worth pursuing once 2-3 implementations exist; not before.
3. **How does multi-user federation actually work?** Matrix federation handles the protocol; the UX of "another human's agents working with mine on shared rooms" needs design before it's offered.
4. **Persona portability across AI tools.** If Cursor and Claude Code both assume the same persona, what's shared (working memory) vs what isn't (tool-specific caches)?
5. **Long-term memory vs working memory compaction.** When does a persona's working memory get compacted? Automatically by recall? Explicitly via `km agent compact`? Never (always-append)?
6. **Knowledge as context vs knowledge as product.** km is used personally today. Could a team use it? A small company? What breaks at scale?

## What this doc supersedes / reframes

- Earlier ad-hoc references to "what km is becoming long-term" — this is the canonical version.
- The split-treatment of "silvercode is the agent host" and "km is the notes app" — this doc unifies them as surfaces of the same workdesk.
- The framing in `hub/silvercode/future/ai-terminal/` that treated silvercode as a standalone product — silvercode is one surface; km is the workdesk; the four-layer (agent / harness / orchestrator / agent host) taxonomy still applies but the agent host is km, not silvercode.
- The treatment of "the ACP-proxy ventures" as 14 separate ideas — they collapse into one cohesive product (agentroom gateway = #11+#12+#13+#14) which is the platform layer of this workdesk.

## Cross-references

### Upstream / vision

- [`hub/km/design/vision.md`](vision.md) — the high-level vision this document elaborates.
- [`docs/principles.md`](../../../docs/principles.md) — design principles governing all of the above.

### License & posture

- [`hub/km/design/licensing-strategy.md`](licensing-strategy.md) — license + commercial-posture decision per layer (silvery / tribe / km / silvercode / agentroom) and per package. /pro-vetted recommendation: pick a clean lane (Cursor-style fully proprietary OR Confluent-style Apache + proprietary cloud services), don't hedge with BSL. Path B is the default unless explicit reason to pick Path A.

### Sibling design

- [`hub/km/design/tribe-matrix.md`](tribe-matrix.md) — the coordination layer implementation design.
- [`hub/silvercode/future/ai-terminal/silvercode-squad-mode.md`](../../silvercode/future/ai-terminal/silvercode-squad-mode.md) — the 0-90 day execution wedge.
- [`hub/silvercode/future/ai-terminal/02-agent-integration.md`](../../silvercode/future/ai-terminal/02-agent-integration.md) — the ACP-not-fork decision with explicit tripwires.
- [`hub/ventures/acp-proxy-2026-04-27.md`](../../ventures/acp-proxy-2026-04-27.md) — the 14 scored ventures, with #11 (agentroom gateway) at 24/25.
- [`hub/silvercode/future/ai-terminal/acp-proxy.md`](../../silvercode/future/ai-terminal/acp-proxy.md) — the ACP-as-proxy source material the ventures are extracted from.
- [`hub/silvercode/future/ai-terminal/silvercode-agent-acpp.md`](../../silvercode/future/ai-terminal/silvercode-agent-acpp.md) — long-horizon "ACP++" agent runtime vision.
- [`hub/tribe/design/recall-thought.md`](../../tribe/design/recall-thought.md) — the seed sub-agent for agentroom edge-compute.

### Landscape / external

- [`hub/silvery/research/coding-agent-landscape.md`](../../silvery/research/coding-agent-landscape.md) — the competitive landscape that informed the squad-mode wedge selection.
- [`hub/silvercode/future/ai-terminal/09-agent-host-landscape.md`](../../silvercode/future/ai-terminal/09-agent-host-landscape.md) — own-loop hosts.
- [`hub/silvercode/future/ai-terminal/10-agent-router-landscape.md`](../../silvercode/future/ai-terminal/10-agent-router-landscape.md) — meta-orchestrators (Symphony, OpenClaw, claude-squad, etc.).

### External research artifacts (2026-04-27)

- `/tmp/coding-agents-deep-result-2026-04-27.md` — OpenAI deep research on coding-agent landscape.
- `/tmp/coding-agents-pro-result-2026-04-27.md` — 4-leg /pro enrichment of the deep research.
- `/tmp/oss-vs-private-deep-context-2026-04-27.md` — context for the OSS-vs-private research (firing now).

## Tracking beads

- `km-all.vision-reframe-2026-04-27` — vision rewrite (km as workspace, not just data)
- `km-all.coding-agent-landscape-2026-04-27` — /deep + /pro pass on competitive landscape
- `km-all.kilo-opencode-fork-2026-04-27` — Kilo's April-2026 opencode rebase docs
- `km-all.oss-vs-private-2026-04-27` — open-source posture analysis (firing now)
- (planned) `km-silvercode.squad-mode-mvp` — squad-mode implementation epic when committed
- (planned) `km-all.agentroom-gateway-v1` — agentroom gateway MVP when commenced (90-180 day window)

## The bottom line

km is not "the notes app that has a coding agent attached." It is **the workdesk where humans, LLMs, and custom apps collaborate on shared markdown**. silvercode is the coding-flavored surface. agentroom is the bridge that lets that workdesk span machines and chat ecosystems. tribe is the live coordination substrate. The vault is the durable truth.

Everything in `hub/silvercode/future/ai-terminal/` and `hub/ventures/` and `hub/km/design/` should ladder up to this document. If a future design doesn't fit somewhere on this map, it probably belongs in a different project (pam, recall, silvery, etc.) — or it indicates this document needs updating, in which case update it rather than work around it.

