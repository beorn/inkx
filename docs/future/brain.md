# The Plain Brain

A knowledge base is a folder. `km init` turns any directory into one — a headless knowledge engine that processes logs into structured, queryable knowledge. Multiple interfaces (TUI, CLI, AI agents, Obsidian) connect to the same knowledge base simultaneously.

"Plain" does triple duty: **plain text** (markdown, JSONL — no proprietary formats), **plain files** (one folder, git-pushable, editor-agnostic), **plain to see** (transparent, inspectable, no hidden state).

A knowledge base is **personal** — designed for one user, not collaborative editing. Multiple interfaces connect simultaneously, but they serve one person's knowledge.

The design combines the transparency of plain-file PKM tools (Obsidian, Logseq — user control, git-versioned, editor-agnostic) with the structured memory of AI agent systems (ENGRAM, Hindsight — queryable triples, confidence scoring, per-category retrieval). Markdown is a view of the data, not the source of truth. The critical path is deterministic — LLM inference is background-only.

> **Relationship to [architecture.md](../architecture.md)**: That document describes km's five-layer system (App → Board → Tree → Storage → FS). The items described here are implemented by that five-layer system — items and blocks map to `KNode` records, queries and mutations flow through the same `emit()` pipeline described in [storage.md](../design/model/storage.md). This document describes the **knowledge base layer** — logs, statements, and the transformations that connect them.
>
> **Status**: Under active development. See [Current State](#current-state) for what's implemented vs planned.

## Core Model

```
                    KNOWLEDGE BASE
                    ──────────────
  Chat logs ──────┐
                  ├──▶ Statements ──▶ Items ──▶ Views
  Edit logs ──────┘    (SPO triples)   (knowledge    (markdown, TUI, API)
                                        objects)
                                           │
                                           │ shaping
                                           ▼
                                       Entities ◀──▶ External Sync
                                    (typed subset)    (CardDAV, CalDAV)
```

**Statements are the single source of truth.** Two kinds of logs produce them:

- **Chat logs** — conversational event sequences (agent transcripts, sync adapter output)
- **Edit logs** — structured edit sequences (file edits, `remember()`, `retract()`)

The pipeline is **unidirectional**: logs produce statements, statements define items, shaping projects entities from items. No loops, no bidirectional sync between internal stores.

The knowledge base has three layers:

| Layer | What | Format | Git-friendly? |
|---|---|---|---|
| **Logs** | Chat logs + edit logs — everything that happened | JSONL (one file per log) | Yes |
| **Statements** | Structured knowledge (SPO triples) | SQLite (derived, rebuildable) | Rebuildable |
| **Knowledge tree** | Items organized hierarchically | `KNode` records (rendered as markdown, TUI, etc.) | Yes (markdown) |

The S and O in SPO can both reference items — a contact is a subject in `(contact:alice, birthday, 12-24)` and an object in `(company:acme, employs, contact:alice)`. Items are what statements describe and connect. Some items are shaped into **entities** — the typed, collection-oriented subset (all contacts, all tasks) that participates in external sync.

Statements are always rebuildable from logs. Delete state.db, replay logs, get identical state.

### Terminology

| Term | What |
|---|---|
| **knowledge base** | What `km init` creates — the whole system |
| **chat log** | A conversational event sequence from one source (agent transcript, sync adapter output) |
| **edit log** | A structured edit sequence (file edits, `remember()`, `retract()`) |
| **statement** | A fact in SPO form (subject-predicate-object) — the unit of knowledge |
| **knowledge tree** | Items organized hierarchically — the tree of KNodes |
| **item** | A knowledge object in the tree — note, contact, task, section. The S and O in SPO reference items. |
| **entity** | An item with a strict type schema — the collection-oriented subset (all contacts, all events). Participates in external sync. |
| **block** | Content within an item (paragraph, code block, quote) |
| **node** | Implementation term for items and blocks (used in code: `KNode` = Knowledge Node) |
| **shaping** | Items → typed entities (deterministic projection, no LLM) |
| **view** | Rendered output — markdown files, TUI, API response |

## Logs

All interaction with the knowledge base is modeled as **logs** — bounded sequences of related events from a single source, with attribution and temporal context.

| Log type | What generates it | Content | Rebuildable? |
|---|---|---|---|
| **Chat log** (agent) | AI conversation (Claude, etc.) | Full transcript — turns, tool calls, reasoning | Yes — re-extract with improved prompts |
| **Chat log** (sync) | External sync (CardDAV, CalDAV) | Sync adapter output — what was fetched/diffed | No — contains authoritative structured data |
| **Edit log** | Human editing session, agent `remember()`/`retract()` | Structured edits — who, when, what changed | Yes — re-extract from diffs |

A raw file edit on disk is just bytes changing — meaningless until km turns it into an event: who made the edit, when, what specifically changed. The log is where meaning lives.

Agent chat logs are the purest event source: the transcript IS the event stream. Edit logs capture the resulting mutations — file diffs, statement insertions, retractions. A single agent action like `remember()` appears in both: the tool call in the chat log, the statement creation in the edit log.

**Source distinction matters.** Agent chat logs contain natural language that can be re-extracted if prompts or models improve — their statements are always rebuildable. Sync chat logs contain authoritative structured data (a contact's phone number from CardDAV is ground truth, not an extraction). This affects confidence scoring and retry strategy.

### Log Event Schema

Log events use the same `Event` structure defined in [storage.md](../design/model/storage.md):

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

Agent chat log events (session lifecycle, messages, tool calls) are defined in [agents.md](../future/agents.md#session-events). Edit log events wrap `node_*` event types. Sync chat log events wrap the sync adapter's diff output.

All log events flow through storage.md's [4-path multiplexer](../design/model/storage.md#the-4-path-multiplexer) (`emit()` → persist, project, broadcast, sync).

### Memory Quality Gradient

Event quality depends on the source:

| Source | Attribution | Context | Why |
|---|---|---|---|
| Agent chat log | Full | Full reasoning, tool calls | Embedded in transcript |
| km CLI/TUI | High | Command + arguments | Available |
| Obsidian (km running) | Medium | What changed, when | No "why" |
| Obsidian (km stopped) | Low | Diff on next startup | No who, no why |

The more the knowledge base is "awake" (km running), the better its memory.

## Statements

Statements are SPO (subject-predicate-object) triples. Everything the knowledge base "knows" is a statement.

### Cognitive Types (ENGRAM)

Every statement is categorized by cognitive type. Per-category retrieval (top-K per type, then merge) prevents cross-type interference. ENGRAM's ablation study showed +31% accuracy from this separation alone.

| Category | What | Example |
|----------|------|---------|
| **fact** | Static knowledge | "Alice's birthday is Dec 24" |
| **event** | Something that happened | "Fixed auth bug in auth.ts:42" |
| **instruction** | How to behave | "Always run bun fix before committing" |

Three categories map cleanly to cognitive science (Tulving's taxonomy) and have proven accuracy gains. Decisions ("chose JWT over session cookies because of microservices") can be stored as facts with a `rationale` predicate — the reasoning lives in the item, not the category. If retrieval quality suffers from decisions drowning in facts, a 4th category can be promoted.

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

## Items & the Knowledge Tree

Items are knowledge objects organized in the **knowledge tree** — notes, tasks, contacts, sections, each containing blocks (paragraphs, code, quotes). The knowledge tree is the tree of `KNode` records, implemented by the five-layer architecture in [architecture.md](../architecture.md) (App → Board → Tree → Storage → FS). All mutations flow through `emit()`.

Items are built from statements. An item exists in the knowledge tree because statements describe it. Items can be rendered as multiple views:

| View | What | Audience |
|---|---|---|
| **Markdown files** | `key:: value` properties, prose, wikilinks | Humans, git, Obsidian |
| **TUI view** | Interactive card/column layout | Humans (km-tui) |
| **API response** | Structured JSON | Agents, integrations |

Markdown is the primary human-facing view — the one that gets committed to git — but it's not the only way to see items.

A random note is an item in the knowledge tree. A contact with `birthday:: 12-24` is also an item — but additionally an entity (see next section). The knowledge tree contains everything; entities are the typed subset.

### Item Identifiers

Items are referenced in statements by a `type:slug` identifier — `contact:alice`, `project:km`, `note:meeting-2026-02-16`. The type prefix enables efficient querying ("all contacts") and is used by shaping to match type signatures. Slugs are human-readable, derived from the item's title or filename. Internally, each `KNode` has a ULID for stable cross-referencing, but the `type:slug` form is what appears in statements and user-facing output.

Items without an explicit type prefix are plain items — `note:weeklog` or just a path-based ID like `projects/km/design`. The type prefix is optional; shaping can infer types from statement patterns regardless.

## Entity Schemas & Shaping

**Entities** are items with strict type schemas. They're the collection-oriented subset — you operate on "all contacts" or "all tasks" as a group, and they participate in external sync.

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

Users can define custom entity types via predicate-pattern inference (Cloudi T8755). An item whose statements match a type signature gets shaped into that entity type. Items that don't match any type stay as untyped items in the knowledge tree — still have statements, still get rendered as views, just no entity schema applied.

### Entity Sync

Entity sync is bidirectional with external systems. Outbound: shaped entities push to external systems (CardDAV, CalDAV). Inbound: external changes arrive as sync chat logs, produce statements through the normal pipeline, which update entities via reshaping.

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

1. File watcher detects change → edit log event
2. **Structured diff** produces statement: `(contact:alice, birthday, 12-25, fact, 1.0)`
3. Statement stored, old statement superseded
4. Entity reshaped, views updated

No LLM. No extraction loop. The file watcher understands `key:: value` syntax and produces statements directly.

### Prose edits (free, direct)

For prose edits to a note: the new content replaces the `content` predicate's blob reference. Same direct pipeline — edit → statement → done.

### Agent knowledge (background, optional)

LLM extraction is for **mining implicit knowledge from agent chat log transcripts**:

- Agent discusses Alice's company → extract `(contact:alice, WORKS_AT, company:acme, fact, 0.8)`
- User mentions a preference → extract instruction statement

This runs **asynchronously in the background**. It's valuable but not required for the system to work. The core loop (edit → statement → entity → view) is fully deterministic.

**Two tiers of extraction:**

| Tier | Input | Method | Cost |
|---|---|---|---|
| **Structured** | `key:: value` properties, frontmatter, wikilinks, tags | Deterministic parsing | Free |
| **Natural language** | Prose paragraphs in agent chat log transcripts | LLM extraction (background) | ~$0.04/chat |

Structured extraction is always safe to re-run (idempotent). NL extraction is rebuildable — if models or prompts improve, re-extract from the same chat logs for better statements.

## Walkthrough: Full Cycle

Alice tells the agent her birthday is December 24th. Here's the complete path:

**1. Chat log event recorded**
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

**3. Item updated**
The `contact:alice` subject now has statements (name, birthday, email from prior chat logs). It exists as an item in the knowledge tree.

**4. Shaping identifies Contact entity**
The statements match the Contact type signature (has name, birthday, email predicates). Shaping projects a Contact entity with all known fields.

**5. Markdown view rendered**
```markdown
## Alice Smith
Type: contact
email:: alice@work.com
birthday:: 12-24
```

**6. CardDAV sync pushes birthday**
Entity sync detects the updated Contact, pushes a vCard update to the CardDAV server. The sync result is recorded as a sync chat log event.

## Disk Layout

```
my-knowledge-base/
├── **/*.md                      # Markdown view (plain markdown)
├── .km/
│   ├── chats/                   # All logs (one JSONL file per log)
│   │   ├── 2026-02-16-abc.jsonl #   Agent chat log
│   │   ├── 2026-02-16-edit-1.jsonl # Edit log (human session)
│   │   └── 2026-02-16-sync-1.jsonl # Sync chat log (CardDAV)
│   ├── blobs/                   # CAS — large content + binaries (SHA-256, prefix-sharded)
│   ├── snapshots/               # Periodic statement checkpoints (for compaction)
│   └── state.db                 # Derived indexes (gitignored, rebuildable)
└── .git/                        # History
```

Four tiers of content:

| Tier | Format | Git? | Rebuildable? |
|---|---|---|---|
| Markdown files | Plain .md | Yes | From statements |
| Logs | Plain .jsonl | Yes | No (source of truth) |
| Blobs | CAS (hash-addressed) | git-lfs | No (source of truth) |
| state.db | SQLite | Gitignored | Yes (replay logs) |

### What state.db Contains (All Derived)

| Index | Derived from | How |
|---|---|---|
| nodes table | Statements + markdown scan | Statement processing + filesystem scan |
| links table (backlinks) | Wikilinks in markdown | Link extraction during scan |
| spo_triples | Logs | Log replay + structured parsing |
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

### Scalability

A personal knowledge base is bounded — one person generates ~10K statements/year from active use. SQLite handles millions of rows trivially. The design choices that keep things fast:

- **FTS5** for keyword search — native SQLite, no external service
- **Compaction** (see below) — snapshot + recent logs keeps rebuild time bounded
- **Derived state** — state.db is a cache, not a source of truth. If queries get slow, add indexes or rebuild
- **Shaping is incremental** — only re-run on changed items, not the full tree

If the knowledge base ever outgrows SQLite (unlikely for personal use), the log-based architecture means you can swap the statement store without losing data — replay logs into a different backend.

## Compaction

Logs accumulate over time. Compaction keeps the knowledge base manageable without deleting content:

- **Recent logs** (e.g., 6 months) — kept in full in `.km/chats/`
- **Checkpoint**: periodically snapshot statement state to `.km/snapshots/`
- **Archive old logs** — compress to `.km/archive/` (never deleted, just moved)
- **Rebuild**: snapshot + recent logs = full state.db

Like a database WAL + checkpointing — the snapshot is the baseline, recent logs are the delta.

## Current State

**Implemented:**
- **Knowledge tree** — the five-layer architecture for items and blocks ([architecture.md](../architecture.md))
- **CalDAV/CardDAV client** — `@km/connector-caldav` package with vCard/iCal parsing ([services.md](../future/services.md))
- **Agent runtime** — `@km/agent` package with harnesses, work queues ([agents.md](../future/agents.md))
- **Chat recall** — FTS5-indexed search across Claude Code chat history (`bun recall`)
- **CAS** — Content-addressable store for large content and binaries (`@km/storage`)

**Planned** (described in this document):
- Log-based event architecture (currently: changes.jsonl, planned: per-log JSONL files)
- Statement store (`packages/km-memory/` — not yet created)
- Structured extraction (markdown → statements via deterministic parsing)
- NL extraction (agent chat log transcripts → statements via LLM, background)
- Entity shaping and sync
- Compaction and archiving

## Implementation Roadmap

### Prototype: Validate Core Assumption
SPO table + recall/remember/retract CLI commands + ENGRAM per-category retrieval. Test with real Claude Code chat logs.

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
CardDAV, CalDAV, Google Calendar. Sync events flow as sync chat logs through the normal pipeline. Builds on `@km/connector-caldav`.

**Success**: A contact added in CardDAV appears as statements + entity + markdown. **Depends on**: Phase 2, Phase 3.

### Phase 5: NL Extraction (Background)
LLM-based extraction from agent chat log transcripts. Runs asynchronously. Confidence scoring, review queue for low-confidence statements.

**Success**: "Alice mentioned she works at Acme" in an agent chat log produces `(contact:alice, company, Acme Corp, fact, 0.8)`. **Depends on**: Phase 1.

### Phase 6: Confidence Accumulation
Multi-source corroboration, contradiction handling, confidence decay.

**Success**: A fact confirmed by 3 sources scores higher than a single-source fact. **Depends on**: Phase 5.

### Phase 7: Embeddings + Unified Query
Semantic search for retrieval mismatch. `repo.query()` + statement store merged via reciprocal rank fusion (RRF).

**Success**: Searching "birthday" finds statements stored as "date of birth". **Depends on**: Phase 1.

### Phase 8: Reflection
Periodic automated synthesis — summarize clusters of event statements into higher-level fact statements, surface contradictions, decay low-confidence orphans. Inspired by Hindsight's reflection layer, which showed that automated reasoning over accumulated memory significantly improves long-horizon recall.

**Success**: After 50 agent sessions about a project, a summary statement captures the key decisions without querying all 50 transcripts. **Depends on**: Phase 5, Phase 6.

## Appendix: PIM Lineage

km's knowledge base layer absorbs designs from two earlier projects in the PIM monorepo:

- **kimmi** — a contacts/calendar CRDT sync project. km absorbs its sync adapters (CardDAV, CalDAV) as event sources and entity schemas.
- **cloudi** — an experimental AI memory system whose unidirectional pipeline directly influenced km's architecture. The full specification lives in Cloudi ADR01 (`~/Code/pim/cloudi/specs/active/ADR01/`; internal, requires cloudi repo checkout). Key designs km absorbs:
  - **Unidirectional pipeline** — Sources → Statements → Entities → Sync. No loops. km adapts this as Logs → Statements → Knowledge Tree + Entities → Sync.
  - **SPO triple store** with simple subject-predicate-object schema (Cypher-compatible)
  - **ENGRAM cognitive types** — per-category retrieval prevents cross-type interference (+31% accuracy)
  - **Bi-temporal model** — transaction time (when recorded) + valid time (when fact was true)
  - **Source distinction** — NL transcripts (rebuildable via re-extraction) vs structured edits (authoritative)
  - **Shaping** — deterministic projection from triples → typed entities (Contact, Event, Task)
  - **Predicate-pattern inference** (T8755) — type signatures for automatic entity classification
  - **Confidence accumulation** — multi-source corroboration scoring
  - **Retraction as statements-about-statements** — immutable append-only, never delete

The PIM ecosystem simplifies to two things:

| | **km** (knowledge base) | **pam** (channels) |
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
- [../storage.md](../design/model/storage.md) — Storage modes, KNode schema, `emit()` pipeline, event types
- [../future/services.md](../future/services.md) — CalDAV/CardDAV connectors
- [../future/agents.md](../future/agents.md) — Agent runtime, harnesses, session events (= chat logs)
- [../explorations/plain-brain.md](../explorations/plain-brain.md) — original exploration (graduated to this doc)
