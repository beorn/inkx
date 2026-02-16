# The Plain Brain

A brain is a folder. `km init` turns any directory into a brain — a headless knowledge engine that processes chats into structured, queryable knowledge. Multiple interfaces (TUI, CLI, AI agents, Obsidian) connect to the same brain simultaneously.

"Plain" does triple duty: **plain text** (markdown, JSONL — no proprietary formats), **plain files** (one folder, git-pushable, editor-agnostic), **plain to see** (transparent, inspectable, no hidden state).

> **Relationship to [architecture.md](../architecture.md)**: That document describes km's five-layer system (App → Board → Tree → Storage → FS). This document describes the **brain layer** — chats, memory, solidification — which sits alongside Storage as a new capability.
>
> **Status**: Under active development. See [Current State](#current-state) for what's implemented vs planned.

## Core Model

```
                          ┌→ knowledge tree (markdown files)
chats (events) ──→ brain ─┤
                          └→ memory graph (SPO triples in state.db)
```

**Chats are the source of truth.** Everything that happens — agent conversations, human edits, calendar sync — is recorded as a chat. The knowledge tree and memory graph are both derived from chats.

The brain has three parts:

| Part | What | Format | Git-friendly? |
|---|---|---|---|
| **Chats** | Everything that happened | JSONL (one file per chat) | Yes |
| **Knowledge tree** | Human-visible content | Markdown files | Yes |
| **Memory graph** | Agent-visible knowledge | SQLite (derived, gitignored) | Rebuildable |

The memory graph is always rebuildable from chats. Delete state.db, replay chats, get identical state.

### Terminology

| Term | What |
|---|---|
| **brain** | The engine — a folder enhanced with chat processing |
| **chat** | A bounded sequence of events from one source |
| **knowledge tree** | Human-visible content (markdown files in a tree) |
| **memory graph** | Agent-visible knowledge (SPO triples, derived from chats) |
| **item** | A meaningful unit in the knowledge tree (note, task, contact, section) |
| **block** | Content within an item (paragraph, code block, quote) |
| **node** | Implementation term for both items and blocks (used in code: `KNode`, `createNode`) |
| **triple** | A fact in the memory graph (subject-predicate-object) |
| **solidification** | Memory graph → markdown file (knowledge becomes permanent and visible) |
| **extraction** | Markdown edit → memory graph update (parsing structured properties + NL processing) |
| **shaping** | Triples → typed entity (deterministic projection, no LLM). E.g. triples about Alice → Contact object |

## Everything is a Chat

All interaction with the brain is modeled as **chats** — bounded sequences of related events from a single source, with attribution and temporal context.

| Chat type | What generates it | Content |
|---|---|---|
| **Agent chat** | AI conversation (Claude, etc.) | Full transcript — turns, tool calls, reasoning |
| **Edit chat** | Human editing session | File watcher output — who, when, what changed |
| **Sync chat** | External sync (CardDAV, CalDAV) | Sync adapter output — what was fetched/diffed |

A raw file edit on disk is just bytes changing — meaningless until km turns it into an event: who made the edit, when, what specifically changed. The chat is where meaning lives.

Agent chats are the purest event source: the transcript IS the event stream. Edit and sync chats require km to observe changes and produce events from them.

### Memory Quality Gradient

Event quality depends on the source:

| Source | Attribution | Context | Why |
|---|---|---|---|
| Agent chat | Full | Full reasoning, tool calls | Embedded in transcript |
| km CLI/TUI | High | Command + arguments | Available |
| Obsidian (km running) | Medium | What changed, when | No "why" |
| Obsidian (km stopped) | Low | Diff on next startup | No who, no why |

The more the brain is "awake" (km running), the better its memory.

## Memory Graph

The memory graph stores structured knowledge as SPO (subject-predicate-object) triples. It's the brain's understanding — derived from chats, queryable by agents.

### Cognitive Types (ENGRAM)

Every triple is categorized by cognitive type. Per-category retrieval (top-K per type, then merge) prevents cross-type interference. ENGRAM's ablation study showed +31% accuracy from this separation alone.

| Category | What | Example |
|----------|------|---------|
| **fact** | Static knowledge | "Alice's birthday is Dec 24" |
| **event** | Something that happened | "Fixed auth bug in auth.ts:42" |
| **instruction** | How to behave | "Always run bun fix before committing" |
| **decision** | A choice made | "Chose JWT over session cookies" |

### Schema

```sql
CREATE TABLE spo_triples (
  id TEXT PRIMARY KEY,            -- ULID
  subject TEXT NOT NULL,          -- entity or node reference
  predicate TEXT NOT NULL,        -- property or relationship
  object TEXT NOT NULL,           -- literal value or entity reference
  category TEXT NOT NULL,         -- fact|event|instruction|decision
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
  For EACH category (fact, event, instruction, decision):
    FTS5 keyword search on spo_fts → top 8
    Subject/predicate exact match → top 4
    Merge, dedupe by subject+predicate
  Merge all categories (~32 candidates)
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

## Decisions
- Chose JWT over session cookies for microservices (conf:0.9)

## Instructions
- Always run bun fix before committing (conf:1.0)
```

## Knowledge Tree

The knowledge tree is the human-visible content — markdown files organized in a tree with items (notes, tasks, contacts, sections) containing blocks (paragraphs, code, quotes).

Humans edit the knowledge tree directly. These edits generate events (via edit chats) which update the memory graph. The knowledge tree is also populated by **solidification** — when knowledge in the memory graph is important enough to become a visible markdown file.

### Solidification

Solidification creates a markdown file from memory graph knowledge:

- **Manual**: `km solidify <subject>` creates a markdown file from all triples about that subject
- **Automatic**: High-confidence entities (e.g., contacts from CardDAV sync) auto-solidify
- **Agent-initiated**: Agent decides knowledge is worth a file

Solidification is just an event — a `node_created` event whose source is the memory graph, flowing through the same pipeline as any other event.

### Entity Schemas

Entities are typed objects projected from SPO triples. Entity shaping is deterministic (no LLM) — aggregate triples by subject, resolve values by predicate.

| Entity | Fields | Sync Target |
|--------|--------|-------------|
| **Contact** | name, birthday, email, phone, company, role | CardDAV |
| **Event** | summary, when, attendees | CalDAV |
| **Task** | title, status, dueDate | CalDAV TODO |
| **Project** | title, status, members | (internal) |
| **Code** | file, function, pattern | (internal) |

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

Structured extraction from frontmatter/properties into triples is free (parsing, no LLM). NL extraction from prose requires LLM (~$0.04/chat).

## Disk Layout

```
my-brain/
├── **/*.md                      # Knowledge tree (plain markdown)
├── .km/
│   ├── chats/                   # All chats (one JSONL file per thread)
│   │   ├── 2026-02-16-abc.jsonl #   Agent chat
│   │   ├── 2026-02-16-edit-1.jsonl # Edit chat (human session)
│   │   └── 2026-02-16-sync-1.jsonl # Sync chat (CardDAV)
│   ├── blobs/                   # CAS — large content + binaries (SHA-256, prefix-sharded)
│   ├── snapshots/               # Periodic memory graph checkpoints (for compaction)
│   └── state.db                 # Derived indexes (gitignored, rebuildable)
└── .git/                        # History
```

Three tiers of content:

| Tier | Format | Git? | Rebuildable? |
|---|---|---|---|
| Markdown files | Plain .md | Yes | From chats (via solidification) |
| Chats | Plain .jsonl | Yes | No (source of truth) |
| Blobs | CAS (hash-addressed) | git-lfs | No (source of truth) |
| state.db | SQLite | Gitignored | Yes (from chats + markdown) |

### What state.db Contains (All Derived)

| Index | Derived from |
|---|---|
| nodes table | Markdown files (knowledge tree) |
| links table (backlinks) | Wikilinks in markdown |
| spo_triples | Chats (extraction events) |
| fts5 (full-text search) | Markdown + triples |
| entities (contacts, events, tasks) | SPO triples (deterministic shaping) |

## Interfaces

Multiple can connect simultaneously:

- **TUI/CLI** (km-tui, km-cli) — km's native interfaces
- **Claude Code** — AI agent via .claude/ configs + km CLI + memory tools
- **pam** — multi-channel AI harness (WhatsApp, email, Telegram)
- **Obsidian** — human GUI editor (reads/writes same markdown)
- **Future: MCP server** — tools for any AI agent

## Failure Modes

| Failure Mode | Mitigation |
|-------------|------------|
| **Stale facts** | `superseded_by` field + recency preference in ranking |
| **Context clash** (conflicting triples) | Bi-temporal validity, conflict detection |
| **Category drift** | Hybrid heuristic+LLM categorization, validation rules |
| **Over-remembering** | TTL on chat-sourced triples (30 days), periodic pruning |
| **Retrieval mismatch** | Embeddings (Phase 2) for semantic matching |

Memory hygiene built in from day one: TTL for ephemeral triples, agent triples persist until retracted, periodic summarization of old events.

## Compaction

Chats accumulate over time. Compaction keeps the brain manageable:

- **Recent chats** (e.g., 6 months) — kept in full in `.km/chats/`
- **Checkpoint**: periodically snapshot the memory graph state to `.km/snapshots/`
- **Archive old chats** — compress to `.km/archive/`
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
- Memory graph (`packages/km-memory/` — not yet created)
- Solidification (memory graph → markdown)
- Extraction (markdown → memory graph triples)
- Compaction and archiving

## Implementation Roadmap

### Prototype (validate core assumption)
- SPO table + recall/remember/retract CLI commands
- ENGRAM per-category retrieval
- Test with real Claude Code chats
- Success metric: agent produces useful triples, recall beats current FTS5-only approach

### Phase 1: Memory Graph + Agent Tools
Core SPO schema, StatementStore, agent tools, keyword search

### Phase 2: Embeddings
Semantic search, handles query/storage phrasing mismatch

### Phase 3: Entity Shaping
Deterministic projection: triples → typed entities (Contact, Event, Task)

### Phase 4: Confidence Accumulation
Multi-source corroboration, contradiction handling

### Phase 5: Sync Adapters
CardDAV, CalDAV, Google (builds on entity shaping + existing `@km/connector-caldav`)

### Phase 6: Extraction
Markdown → triples (structured extraction from frontmatter/links/tags)

### Phase 7: Solidification
Memory graph → markdown files (manual + automatic)

### Phase 8: Unified Query
repo.query() + memory graph merged via RRF

## Appendix: PIM Lineage

km's brain layer absorbs designs from two earlier projects in the PIM monorepo:

- **kimmi** — a contacts/calendar CRDT sync project. km absorbs its sync adapters (CardDAV, CalDAV) as event sources and entity schemas.
- **cloudi** — an experimental AI memory system. The full specification lives in Cloudi ADR01 (`~/Code/pim/cloudi/specs/active/ADR01/`; internal, requires cloudi repo checkout). Key designs km absorbs:
  - **SPO triple store** with simple subject-predicate-object schema (Cypher-compatible)
  - **ENGRAM cognitive types** — per-category retrieval prevents cross-type interference (+31% accuracy)
  - **Bi-temporal model** — transaction time (when recorded) + valid time (when fact was true)
  - **Source distinction** — NL transcripts (rebuildable via re-extraction) vs structured operations (authoritative)
  - **Shaping** — deterministic projection from triples → typed entities (Contact, Event, Task)
  - **Confidence accumulation** — multi-source corroboration scoring
  - **Retraction as statements-about-statements** — immutable append-only, never delete

The PIM ecosystem simplifies to two things:

| | **km** (brain) | **pam** (channels) |
|---|---|---|
| **Purpose** | Knowledge engine | Multi-channel AI assistant |
| **Absorbs** | kimmi (sync), cloudi (memory) | cloudi (channels) |
| **Contains** | Knowledge tree, memory graph, entity sync, search | Channel adapters, security harness, conversation state |
| **Interface** | Library, CLI, MCP, TUI | WhatsApp, email, Telegram, web |

## References

- [memory-systems-analysis.md](../explorations/memory-systems-analysis.md) — ENGRAM/AutoMem/Hindsight research evaluation
- [ENGRAM paper](https://openreview.net/forum?id=D7WqEZzwRR) (ICLR 2026) — cognitive type separation, +31% accuracy
- [Letta benchmark](https://www.letta.com/blog/benchmarking-ai-agent-memory) — filesystem memory (74% LoCoMo) > Mem0 graph (68.5%)
- [Hindsight](https://arxiv.org/abs/2512.12818) — 91.4% LongMemEval, multi-pathway RRF

## See Also

- [../architecture.md](../architecture.md) — km system architecture (layers, data flow, events)
- [../storage.md](../storage.md) — Storage modes, KNode schema, bidirectional sync
- [../future/services.md](../future/services.md) — CalDAV/CardDAV connectors
- [../future/agents.md](../future/agents.md) — Agent runtime, harnesses, chats
- [../explorations/plain-brain.md](../explorations/plain-brain.md) — original exploration (graduated to this doc)
