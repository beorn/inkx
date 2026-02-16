# The Plain Brain

A brain is a folder. `km init` turns any directory into a brain — a headless knowledge engine that processes chats into structured, queryable knowledge. Multiple interfaces (TUI, CLI, AI agents, Obsidian) connect to the same brain simultaneously.

"Plain" does triple duty: **plain text** (markdown, JSONL — no proprietary formats), **plain files** (one folder, git-pushable, editor-agnostic), **plain to see** (transparent, inspectable, no hidden state).

> **Relationship to [architecture.md](../architecture.md)**: That document describes km's five-layer system (App → Board → Tree → Storage → FS). The knowledge tree described here is implemented by that five-layer system — items and blocks map to `KNode` records, queries and mutations flow through the same `emit()` pipeline described in [storage.md](../storage.md). This document describes the **brain layer** — chats, statements, and the transformations that connect them.
>
> **Status**: Under active development. See [Current State](#current-state) for what's implemented vs planned.

## Core Model

```
                    KNOWLEDGE BASE
                    ──────────────
  Chats ───────┐
               ├──▶ Statements ──▶ Objects ──▶ Materializations
  Operations ──┘    (SPO triples)   (knowledge     (markdown, TUI, API)
                                     objects)
                                        │
                                        │ shaping
                                        ▼
                                    Entities ◀──▶ External Sync
                                 (typed subset)    (CardDAV, CalDAV)
```

**Statements are the single source of truth.** Two kinds of event sources produce them:

- **Chats** — agent conversations, sync adapter output (bounded event sequences)
- **Operations** — structured edits from humans or agents (direct, deterministic)

The pipeline is **unidirectional**: event sources produce statements, statements define objects, shaping projects entities from objects. No loops, no bidirectional sync between internal stores.

The knowledge base has three layers:

| Layer | What | Format | Git-friendly? |
|---|---|---|---|
| **Event sources** | Chats + operations — everything that happened | JSONL (one file per chat) | Yes |
| **Statements** | Structured knowledge (SPO triples) | SQLite (derived, rebuildable) | Rebuildable |
| **Objects** | Knowledge objects organized in a tree | `KNode` records (materialized as markdown, TUI, etc.) | Yes (markdown) |

The S and O in SPO both reference objects — a contact is a subject in `(contact:alice, birthday, 12-24)` and an object in `(company:acme, employs, contact:alice)`. Objects are what statements describe and connect. Some objects are shaped into **entities** — the typed, collection-oriented subset (all contacts, all tasks) that participates in external sync.

Statements are always rebuildable from event sources. Delete state.db, replay chats, get identical state.

### Terminology

| Term | What |
|---|---|
| **brain** | The engine — a folder enhanced with chat processing |
| **chat** | A bounded sequence of events from one source |
| **statement** | A fact in SPO form (subject-predicate-object) — the unit of knowledge |
| **object** | A knowledge object in the tree — note, contact, task, section. The S and O in SPO reference objects. |
| **knowledge tree** | Objects organized in a tree |
| **entity** | An object with a strict type schema — the collection-oriented subset (all contacts, all events). Participates in external sync. |
| **block** | Content within an object (paragraph, code block, quote) |
| **node** | Implementation term for objects and blocks (used in code: `KNode`, `createNode`) |
| **shaping** | Objects → typed entities (deterministic projection, no LLM) |
| **materialization** | Rendering the knowledge tree into a specific format (markdown files, TUI view, API response) |

## Everything is a Chat

All interaction with the brain is modeled as **chats** — bounded sequences of related events from a single source, with attribution and temporal context.

| Chat type | What generates it | Content | Rebuildable? |
|---|---|---|---|
| **Agent chat** | AI conversation (Claude, etc.) | Full transcript — turns, tool calls, reasoning | Yes — re-extract with improved prompts |
| **Edit chat** | Human editing session | File watcher output — who, when, what changed | Yes — re-extract from diffs |
| **Sync chat** | External sync (CardDAV, CalDAV) | Sync adapter output — what was fetched/diffed | No — contains authoritative structured data |

A raw file edit on disk is just bytes changing — meaningless until km turns it into an event: who made the edit, when, what specifically changed. The chat is where meaning lives.

Agent chats are the purest event source: the transcript IS the event stream. Edit and sync chats require km to observe changes and produce events from them.

**Source distinction matters.** Agent and edit chats contain natural language that can be re-extracted if prompts or models improve — their statements are always rebuildable. Sync chats contain authoritative structured data (a contact's phone number from CardDAV is ground truth, not an extraction). This affects confidence scoring and retry strategy.

### Chat Event Schema

Chat events use the same `Event` structure defined in [storage.md](../storage.md):

```typescript
interface Event {
  id: string         // ULID
  type: EventType    // session_started, session_message, node_updated, ...
  actor: string      // 'user', 'system', 'fs-watch', agent ID
  target?: string    // Node ID
  data: unknown
  ts: number         // Unix ms
}
```

Agent chat events (session lifecycle, messages, tool calls) are defined in [agents.md](../future/agents.md#session-events). Edit chat events wrap `node_*` event types. Sync chat events wrap the sync adapter's diff output.

All chat events flow through storage.md's [4-path multiplexer](../storage.md#the-4-path-multiplexer) (`emit()` → persist, project, broadcast, sync).

### Memory Quality Gradient

Event quality depends on the source:

| Source | Attribution | Context | Why |
|---|---|---|---|
| Agent chat | Full | Full reasoning, tool calls | Embedded in transcript |
| km CLI/TUI | High | Command + arguments | Available |
| Obsidian (km running) | Medium | What changed, when | No "why" |
| Obsidian (km stopped) | Low | Diff on next startup | No who, no why |

The more the brain is "awake" (km running), the better its memory.

## Statements

Statements are SPO (subject-predicate-object) triples — the single source of truth for structured knowledge. Everything the brain "knows" is a statement.

### Cognitive Types (ENGRAM)

Every statement is categorized by cognitive type. Per-category retrieval (top-K per type, then merge) prevents cross-type interference. ENGRAM's ablation study showed +31% accuracy from this separation alone.

| Category | What | Example |
|----------|------|---------|
| **fact** | Static knowledge | "Alice's birthday is Dec 24" |
| **event** | Something that happened | "Fixed auth bug in auth.ts:42" |
| **instruction** | How to behave | "Always run bun fix before committing" |

Three categories map cleanly to cognitive science (Tulving's taxonomy) and have proven accuracy gains. Decisions ("chose JWT over session cookies because of microservices") can be stored as facts with a `rationale` predicate — the reasoning lives in the object, not the category. If retrieval quality suffers from decisions drowning in facts, a 4th category can be promoted.

### Schema

```sql
CREATE TABLE spo_triples (
  id TEXT PRIMARY KEY,            -- ULID
  subject TEXT NOT NULL,          -- entity or node reference
  predicate TEXT NOT NULL,        -- property or relationship
  object TEXT NOT NULL,           -- literal value or entity reference
  category TEXT NOT NULL,         -- fact|event|instruction
  confidence REAL DEFAULT 0.9,   -- 0-1
  source_type TEXT NOT NULL,      -- agent|chat|node|git|sync
  source_ref TEXT,                -- chat ID, node ID, etc.
  speaker TEXT,                   -- who stated this (for corroboration)
  timestamp INTEGER NOT NULL,    -- Unix ms
  validity TEXT,                  -- JSON [from, to] bi-temporal
  superseded_by TEXT              -- FK to newer triple (retraction)
);
```

### Agent Tools

Three tools that make memory active, not passive:

- **memory.recall(query, category?)** — per-category retrieval, ranked by confidence + recency
- **memory.remember(subject, predicate, object, category)** — agent explicitly stores knowledge
- **memory.retract(id, reason)** — agent corrects or removes stale knowledge

Exposed as: km CLI commands, MCP tools, TypeScript API.

### Retrieval Algorithm

```
recall(query, categories?):
  For EACH category (fact, event, instruction):
    FTS5 keyword search on spo_fts → top 8
    Subject/predicate exact match → top 4
    Merge, dedupe by subject+predicate
  Merge all categories (~24 candidates)
  Rank by: 0.5×confidence + 0.3×recency + 0.2×category_match
  Truncate to token budget (~4000 tokens)
  Format as structured context block
```

### Context Injection Format

```
## Known Facts
- jwt-refresh bug_cause: "checks exp not iat" (conf:1.0, chat 2/14)
- auth.ts uses JWT, not session cookies (conf:0.9, node: auth-design.md)

## Recent Events
- [2d ago] Fixed jwt-refresh bug in auth.ts:42

## Instructions
- Always run bun fix before committing (conf:1.0)
```

## Knowledge Tree

The knowledge tree is objects organized in a tree — notes, tasks, contacts, sections, each containing blocks (paragraphs, code, quotes). It's implemented by the five-layer architecture in [architecture.md](../architecture.md) (App → Board → Tree → Storage → FS), where objects and blocks are stored as `KNode` records and all mutations flow through `emit()`.

The knowledge tree is built from statements. An object exists in the tree because statements describe it. Objects can be materialized in multiple ways:

| Materialization | What | Audience |
|---|---|---|
| **Markdown files** | `key:: value` properties, prose, wikilinks | Humans, git, Obsidian |
| **TUI view** | Interactive card/column layout | Humans (km-tui) |
| **API response** | Structured JSON | Agents, integrations |

Markdown is the primary human-facing materialization — the one that gets committed to git — but it's not the only view of the tree.

A random note is a thing in the tree. A contact with `birthday:: 12-24` is also a thing in the tree — but additionally an entity (see next section). The tree contains everything; entities are the typed subset.

## Entity Schemas & Shaping

**Entities** are things in the knowledge tree with strict type schemas. They're the collection-oriented subset — you operate on "all contacts" or "all tasks" as a group, and they participate in external sync.

**Shaping** is the deterministic projection that identifies entities within the knowledge tree. No LLM — match statements against type signatures (predicate-pattern inference), aggregate by subject, validate against the entity schema.

### Built-in PIM Types

| Entity | Key Predicates | Sync Target |
|--------|----------------|-------------|
| **Contact** | name, birthday, email, phone, company, role | CardDAV |
| **Event** | summary, when, attendees, location | CalDAV |
| **Task** | title, status, dueDate, priority | CalDAV TODO |
| **Project** | title, status, members | — |
| **Note** | title, content (blob ref) | — |

### Custom Types

Users can define custom entity types via predicate-pattern inference (Cloudi T8755). A thing whose statements match a type signature gets shaped into that entity type. Things that don't match any type stay as untyped items in the tree — still have statements, still get materialized, just no entity schema applied.

### Entity Sync

Entity sync is bidirectional with external systems. Outbound: shaped entities push to external systems (CardDAV, CalDAV). Inbound: external changes arrive as sync chats, produce statements through the normal pipeline, which update entities via reshaping.

Sync always flows through statements — external data never bypasses the pipeline.

Contact items in km as schema'd markdown:

```markdown
## Alice Smith
Type: contact
email:: alice@work.com
phone:: +1-555-1234
birthday:: 12-24
company:: Acme Corp
role:: Engineering Lead
```

## How Edits Work

All edits follow the same unidirectional pipeline. No extraction loops, no bidirectional internal sync.

### Structured edits (free, deterministic)

When a human edits `contacts/alice.md` and changes `birthday:: 12-24` to `birthday:: 12-25`:

1. File watcher detects change → edit chat event
2. **Structured diff** produces operation: `(contact:alice, birthday, 12-25, fact, 1.0)`
3. Statement stored, old statement superseded
4. Entity reshaped, materializations updated

No LLM. No extraction loop. The file watcher understands `key:: value` syntax and produces statements directly.

### Prose edits (free, direct)

For prose edits to a note: the new content replaces the `content` predicate's blob reference. Same direct pipeline — edit → statement → done.

### Agent knowledge (background, optional)

LLM extraction is for **mining implicit knowledge from agent chat transcripts**:

- Agent discusses Alice's company → extract `(contact:alice, WORKS_AT, company:acme, fact, 0.8)`
- User mentions a preference → extract instruction statement

This runs **asynchronously in the background**. It's valuable but not required for the system to work. The core loop (edit → statement → entity → materialization) is fully deterministic.

**Two tiers of extraction:**

| Tier | Input | Method | Cost |
|---|---|---|---|
| **Structured** | `key:: value` properties, frontmatter, wikilinks, tags | Deterministic parsing | Free |
| **Natural language** | Prose paragraphs in agent chat transcripts | LLM extraction (background) | ~$0.04/chat |

Structured extraction is always safe to re-run (idempotent). NL extraction is rebuildable — if models or prompts improve, re-extract from the same chats for better statements.

## Walkthrough: Full Cycle

Alice tells the agent her birthday is December 24th. Here's the complete path through the brain:

**1. Chat event recorded**
```jsonl
// .km/chats/2026-02-16-agent-abc.jsonl
{"id":"01J...","type":"session_message","actor":"kimmi","data":{
  "role":"user","content":"My birthday is December 24th"}}
{"id":"01J...","type":"session_message","actor":"kimmi","data":{
  "role":"assistant","content":"Got it! I'll remember your birthday is Dec 24."}}
{"id":"01J...","type":"session_tool_call","actor":"kimmi","data":{
  "tool":"memory.remember","args":{"subject":"contact:alice","predicate":"birthday","object":"12-24","category":"fact"}}}
```

**2. Statement stored**
```sql
INSERT INTO spo_triples VALUES (
  '01J...', 'contact:alice', 'birthday', '12-24',
  'fact', 0.95, 'agent', 'chat:2026-02-16-agent-abc',
  'alice', 1739750400000, NULL, NULL
);
```

**3. Knowledge tree updated**
The `contact:alice` subject now has statements (name, birthday, email from prior chats). It exists as a thing in the tree.

**4. Shaping identifies Contact entity**
The statements match the Contact type signature (has name, birthday, email predicates). Shaping projects a Contact entity with all known fields.

**5. Markdown materialized**
```markdown
## Alice Smith
Type: contact
email:: alice@work.com
birthday:: 12-24
```

**6. CardDAV sync pushes birthday**
Entity sync detects the updated Contact, pushes a vCard update to the CardDAV server. The sync result is recorded as a sync chat event.

## Disk Layout

```
my-brain/
├── **/*.md                      # Markdown materialization (plain markdown)
├── .km/
│   ├── chats/                   # All chats (one JSONL file per thread)
│   │   ├── 2026-02-16-abc.jsonl #   Agent chat
│   │   ├── 2026-02-16-edit-1.jsonl # Edit chat (human session)
│   │   └── 2026-02-16-sync-1.jsonl # Sync chat (CardDAV)
│   ├── blobs/                   # CAS — large content + binaries (SHA-256, prefix-sharded)
│   ├── snapshots/               # Periodic statement checkpoints (for compaction)
│   └── state.db                 # Derived indexes (gitignored, rebuildable)
└── .git/                        # History
```

Three tiers of content:

| Tier | Format | Git? | Rebuildable? |
|---|---|---|---|
| Markdown files | Plain .md | Yes | From statements |
| Chats | Plain .jsonl | Yes | No (source of truth) |
| Blobs | CAS (hash-addressed) | git-lfs | No (source of truth) |
| state.db | SQLite | Gitignored | Yes (replay chats) |

### What state.db Contains (All Derived)

| Index | Derived from | How |
|---|---|---|
| nodes table | Statements + markdown scan | Statement processing + filesystem scan |
| links table (backlinks) | Wikilinks in markdown | Link extraction during scan |
| spo_triples | Chats | Chat replay + structured parsing |
| fts5 (full-text search) | Statements + markdown | Indexed on insert |
| entities (contacts, events, tasks) | Statements | Deterministic shaping |

## Interfaces

Multiple can connect simultaneously:

- **TUI/CLI** (km-tui, km-cli) — km's native interfaces
- **Claude Code** — AI agent via .claude/ configs + km CLI + memory tools
- **pam** — multi-channel AI harness (WhatsApp, email, Telegram)
- **Obsidian** — human GUI editor (reads/writes same markdown)
- **Future: MCP server** — tools for any AI agent

## Failure Modes & Risks

| Failure Mode | Severity | Mitigation |
|-------------|----------|------------|
| **Extraction errors** (NL) | High | Confidence threshold (≥0.8 auto-accept), low-confidence review queue, prefer structured over NL, background-only |
| **Stale facts** | Medium | `superseded_by` field + recency preference in ranking |
| **Context clash** (conflicting statements) | Medium | Bi-temporal validity, conflict detection |
| **Sync conflicts** (entity ↔ external) | Medium | Last-writer-wins with conflict log, entity-level locking |
| **Category drift** | Low | Hybrid heuristic+LLM categorization, validation rules |
| **Over-remembering** | Low | TTL on chat-sourced statements (30 days), periodic pruning |
| **Retrieval mismatch** | Low | Embeddings (future) for semantic matching |

No dual-store divergence risk — the pipeline is unidirectional. Statements are the single source of truth; the knowledge tree and entities are derived projections.

Memory hygiene built in from day one: TTL for ephemeral statements, agent statements persist until retracted, periodic summarization of old events.

## Compaction

Chats accumulate over time. Compaction keeps the brain manageable without deleting content:

- **Recent chats** (e.g., 6 months) — kept in full in `.km/chats/`
- **Checkpoint**: periodically snapshot statement state to `.km/snapshots/`
- **Archive old chats** — compress to `.km/archive/` (never deleted, just moved)
- **Rebuild**: snapshot + recent chats = full state.db

Like a database WAL + checkpointing — the snapshot is the baseline, recent chats are the delta.

## Current State

**Implemented:**
- **Knowledge tree** — the five-layer architecture for items and blocks ([architecture.md](../architecture.md))
- **CalDAV/CardDAV client** — `@km/connector-caldav` package with vCard/iCal parsing ([services.md](../future/services.md))
- **Agent runtime** — `@km/agent` package with harnesses, work queues ([agents.md](../future/agents.md))
- **Chat recall** — FTS5-indexed search across Claude Code chat history (`bun recall`)
- **CAS** — Content-addressable store for large content and binaries (`@km/storage`)

**Planned** (described in this document):
- Chat-based event architecture (currently: events.jsonl, planned: per-chat JSONL files)
- Statement store (`packages/km-memory/` — not yet created)
- Structured extraction (markdown → statements via deterministic parsing)
- NL extraction (agent chat transcripts → statements via LLM, background)
- Entity shaping and sync
- Compaction and archiving

## Implementation Roadmap

### Prototype: Validate Core Assumption
SPO table + recall/remember/retract CLI commands + ENGRAM per-category retrieval. Test with real Claude Code chats.

**Success**: Agent produces useful statements; recall beats current FTS5-only approach.

### Phase 1: Statement Store + Agent Tools
Core SPO schema, `StatementStore`, agent tools (recall/remember/retract), keyword + FTS5 search.

**Success**: Agents can remember and recall facts across sessions. **Depends on**: nothing (starting point).

### Phase 2: Structured Extraction
Parse `key:: value` properties, frontmatter, wikilinks, and tags from markdown into statements. No LLM. Human edits produce statements directly via structured diff.

**Success**: Editing `birthday:: 12-24` in a contact file produces a statement. **Depends on**: Phase 1 (needs statement store).

### Phase 3: Entity Shaping
Deterministic projection: match statements against type signatures → typed entities (Contact, Event, Task). Entity table in state.db. Collection-level operations (list all contacts, filter tasks by status).

**Success**: `km entity contact:alice` shows a shaped Contact with all known fields. **Depends on**: Phase 1.

### Phase 4: Sync Adapters
CardDAV, CalDAV, Google Calendar. Sync events flow as sync chats through the normal pipeline. Builds on `@km/connector-caldav`.

**Success**: A contact added in CardDAV appears as statements + entity + markdown. **Depends on**: Phase 2, Phase 3.

### Phase 5: NL Extraction (Background)
LLM-based extraction from agent chat transcripts. Runs asynchronously. Confidence scoring, review queue for low-confidence statements.

**Success**: "Alice mentioned she works at Acme" in an agent chat produces `(contact:alice, company, Acme Corp, fact, 0.8)`. **Depends on**: Phase 1.

### Phase 6: Confidence Accumulation
Multi-source corroboration, contradiction handling, confidence decay.

**Success**: A fact confirmed by 3 sources scores higher than a single-source fact. **Depends on**: Phase 5.

### Phase 7: Embeddings + Unified Query
Semantic search for retrieval mismatch. `repo.query()` + statement store merged via reciprocal rank fusion (RRF).

**Success**: Searching "birthday" finds statements stored as "date of birth". **Depends on**: Phase 1.

## Appendix: PIM Lineage

km's brain layer absorbs designs from two earlier projects in the PIM monorepo:

- **kimmi** — a contacts/calendar CRDT sync project. km absorbs its sync adapters (CardDAV, CalDAV) as event sources and entity schemas.
- **cloudi** — an experimental AI memory system whose unidirectional pipeline directly influenced km's architecture. The full specification lives in Cloudi ADR01 (`~/Code/pim/cloudi/specs/active/ADR01/`; internal, requires cloudi repo checkout). Key designs km absorbs:
  - **Unidirectional pipeline** — Sources → Statements → Entities → Sync. No loops. km adapts this as Chats → Statements → Knowledge Tree + Entities → Sync.
  - **SPO triple store** with simple subject-predicate-object schema (Cypher-compatible)
  - **ENGRAM cognitive types** — per-category retrieval prevents cross-type interference (+31% accuracy)
  - **Bi-temporal model** — transaction time (when recorded) + valid time (when fact was true)
  - **Source distinction** — NL transcripts (rebuildable via re-extraction) vs structured operations (authoritative)
  - **Shaping** — deterministic projection from triples → typed entities (Contact, Event, Task)
  - **Predicate-pattern inference** (T8755) — type signatures for automatic entity classification
  - **Confidence accumulation** — multi-source corroboration scoring
  - **Retraction as statements-about-statements** — immutable append-only, never delete

The PIM ecosystem simplifies to two things:

| | **km** (brain) | **pam** (channels) |
|---|---|---|
| **Purpose** | Knowledge engine | Multi-channel AI assistant |
| **Absorbs** | kimmi (sync), cloudi (memory + pipeline) | cloudi (channels) |
| **Contains** | Knowledge tree, statements, entity sync, search | Channel adapters, security harness, conversation state |
| **Interface** | Library, CLI, MCP, TUI | WhatsApp, email, Telegram, web |

## References

- [memory-systems-analysis.md](../explorations/memory-systems-analysis.md) — ENGRAM/AutoMem/Hindsight research evaluation
- [ENGRAM paper](https://openreview.net/forum?id=D7WqEZzwRR) (ICLR 2026) — cognitive type separation, +31% accuracy
- [Letta benchmark](https://www.letta.com/blog/benchmarking-ai-agent-memory) — filesystem memory (74% LoCoMo) > Mem0 graph (68.5%)
- [Hindsight](https://arxiv.org/abs/2512.12818) — 91.4% LongMemEval, multi-pathway RRF

## See Also

- [../architecture.md](../architecture.md) — km system architecture (layers, data flow, events)
- [../storage.md](../storage.md) — Storage modes, KNode schema, `emit()` pipeline, event types
- [../future/services.md](../future/services.md) — CalDAV/CardDAV connectors
- [../future/agents.md](../future/agents.md) — Agent runtime, harnesses, session events (= agent chats)
- [../explorations/plain-brain.md](../explorations/plain-brain.md) — original exploration (graduated to this doc)
