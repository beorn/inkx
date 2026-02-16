# The Plain Brain

km is an **externalized brain** for humans and AI agents. A headless knowledge engine that turns plain markdown files into a structured, queryable, history-aware knowledge system. Multiple interfaces — TUI, CLI, AI agents, Obsidian — connect to the same brain simultaneously.

The brain layer adds **structured memory** (SPO triples), **entity modeling** (contacts, events, tasks), and **multi-source event processing** (session transcripts, CalDAV sync, git history) to km's existing node tree. Your data stays in plain markdown — the brain layer derives queryable indexes from it, the same way km already derives backlinks from wikilinks.

> **Relationship to [architecture.md](../architecture.md)**: The main architecture doc describes km's current five-layer system (App → Board → Tree → Storage → FS). This document extends that with the **brain layer** — event sources, SPO memory, entity modeling — which sits alongside Storage as a new capability. The five-layer stack handles nodes and navigation; the brain layer handles knowledge, memory, and external sync.
>
> **Status**: The brain layer is under active development. See [Current State](#current-state) for what's implemented vs planned.

## Architecture

```
Interfaces:

┌──────────┐  ┌───────────┐  ┌───────────┐  ┌──────────┐
│ TUI/CLI  │  │Claude Code│  │   pam     │  │ Obsidian │
│ (human)  │  │  (agent)  │  │ channels  │  │ (human)  │
└────┬─────┘  └─────┬─────┘  └─────┬─────┘  └────┬─────┘
     └──────────┬───┴──────────────┴──────────────┘
                │
Brain (km):     │
     ┌──────────▼──────────────────────────────────┐
     │                                              │
     │  Event Sources ──→ Processing ──→ Indexes    │
     │                                              │
     │  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
     │  │  Nodes   │  │  Memory  │  │   Sync    │  │
     │  │(markdown)│  │  (SPO    │  │ (CardDAV, │  │
     │  │          │  │  triples)│  │  CalDAV)  │  │
     │  └──────────┘  └──────────┘  └───────────┘  │
     │                                              │
     └──────────────────────────────────────────────┘
                │
                ↕ bidirectional sync
     ┌──────────────────────────────────────────────┐
     │  Plain markdown files (source of truth)       │
     └──────────────────────────────────────────────┘
```

**Brain (km)**: Portable knowledge engine. One folder = one brain. Git-pushable.
- Structured node tree with typed nodes, parent/child, metadata, ordering
- Full event history (every mutation recorded, auditable, replayable)
- SPO memory layer (agent memory, entity modeling, cognitive type separation)
- Queryable indexes (SQLite, FTS5, SPO triples, backlinks)
- Self-describing (contains agent configs: CLAUDE.md, skills, agent definitions)

**Interfaces** (multiple can connect simultaneously):
- **TUI/CLI** (km-tui, km-cli) — km's native interfaces
- **Claude Code** — AI agent via .claude/ configs + km CLI + memory tools
- **pam** (Personal Assistant Machine) — multi-channel AI harness (WhatsApp, email, Telegram)
- **Obsidian** — human GUI editor (reads/writes same markdown)
- **Future: web boardliner** — browser interface
- **Future: MCP server** — tools for any AI agent

## Event Source Architecture

km processes data from multiple sources through a unified pipeline. All sources produce events; all events flow through the same processing pipeline to update derived indexes.

### Event Sources

```
Event Sources:                           Derived Indexes:

  Node edits ──────→ events.jsonl ──┐    ┌→ nodes table
  Session transcripts ──────────────├──→─┤→ links table (backlinks)
  Git log ──────────────────────────┤    ├→ spo_triples table
  CardDAV/CalDAV sync ─────────────┤    ├→ FTS5 index
  pam channel messages ─────────────┘    └→ (future: embeddings)
```

Each source implements a common interface:

```typescript
interface EventSource {
  id: string                       // "node-edits", "sessions", "carddav", "git"
  type: "transcript" | "operation" // rebuildable NL vs authoritative structured
  poll(): AsyncIterable<Event>     // or watch() for live sources
}
```

### Source Types

| Type | What | Rebuildable? | Examples |
|------|------|-------------|----------|
| **Transcript** | Natural language needing interpretation | Yes (re-extract if prompts improve) | Session transcripts, chat messages |
| **Operation** | Structured system input | No (authoritative) | CardDAV sync, git commits, node edits |

### Processing Pipeline

Each event source feeds the same processing pipeline:

1. **Node events** → update nodes table → extract backlinks → extract SPO triples → update FTS5
2. **Session events** → LLM extraction → SPO triples (optionally promote to nodes)
3. **Sync events** → create/update entity nodes → extract SPO triples
4. **Channel events** → LLM extraction → SPO triples (optionally promote to nodes)

New sources are pluggable — implement the EventSource interface, register it.

## SPO Memory Layer

The SPO (Subject-Predicate-Object) triple store is the agent's structured memory and km's entity modeling layer. The design builds on the Cloudi ADR01 specification (see [Appendix: PIM Lineage](#appendix-pim-lineage)).

### What SPOs Provide

- **Agent memory**: recall/remember/retract across sessions
- **Entity modeling**: Contacts, Events, Tasks as schema'd entities
- **External sync**: CardDAV, CalDAV via entity shaping (Phase 3)
- **Cognitive type separation**: ENGRAM fact/event/instruction/decision for retrieval
- **Human visibility**: Important triples promoted to markdown nodes

### SPO as Derived Index

SPO triples are a derived layer — same pattern as backlinks:

```
Markdown nodes (source of truth)
    ↓ parse/extract
SQLite state.db:
  nodes table        ← node data (existing)
  links table        ← backlinks from wikilinks (existing)
  spo_triples table  ← SPO triples from all sources (new)
  nodes_fts          ← full-text search (existing)
```

Triples don't get markdown files by default. They live in SQLite only (like backlinks). **Promotion** is the bridge: when a triple (or cluster of triples about an entity) is important enough to be human-visible, it becomes a markdown node.

### Schema

```sql
CREATE TABLE spo_triples (
  id TEXT PRIMARY KEY,            -- ULID
  subject TEXT NOT NULL,          -- entity or node reference
  predicate TEXT NOT NULL,        -- property or relationship
  object TEXT NOT NULL,           -- literal value or entity reference
  category TEXT NOT NULL,         -- fact|event|instruction|decision
  confidence REAL DEFAULT 0.9,   -- 0-1
  source_type TEXT NOT NULL,      -- agent|session|node|git|sync|channel
  source_ref TEXT,                -- session ID, node ID, etc.
  speaker TEXT,                   -- who stated this (for corroboration)
  timestamp INTEGER NOT NULL,    -- Unix ms
  validity TEXT,                  -- JSON [from, to] bi-temporal
  superseded_by TEXT              -- FK to newer triple (retraction)
);
```

### Cognitive Types (ENGRAM)

Every triple is categorized by cognitive type. Per-category retrieval (top-K per type, then merge) prevents cross-type interference. ENGRAM's ablation study showed +31% accuracy from this separation alone.

| Category | What | Example |
|----------|------|---------|
| **fact** | Static knowledge | "Alice's birthday is Dec 24" |
| **event** | Something that happened | "Fixed auth bug in auth.ts:42" |
| **instruction** | How to behave | "Always run bun fix before committing" |
| **decision** | A choice made | "Chose JWT over session cookies" |

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
- jwt-refresh bug_cause: "checks exp not iat" (conf:1.0, session 2/14)
- auth.ts uses JWT, not session cookies (conf:0.9, node: auth-design.md)

## Recent Events
- [2d ago] Fixed jwt-refresh bug in auth.ts:42

## Decisions
- Chose JWT over session cookies for microservices (conf:0.9)

## Instructions
- Always run bun fix before committing (conf:1.0)
```

## Entity Schemas

Entities are typed objects projected from SPO triples. Entity shaping is deterministic (no LLM) — aggregate statements by subject, resolve values by predicate.

| Entity | Fields | Sync Target |
|--------|--------|-------------|
| **Contact** | name, birthday, email, phone, company, role | CardDAV |
| **Event** | summary, when, attendees | CalDAV |
| **Task** | title, status, dueDate | CalDAV TODO |
| **Project** | title, status, members | (internal) |
| **Code** | file, function, pattern | (internal) |

Contact nodes in km as schema'd markdown:

```markdown
## Alice Smith
Type: contact
email:: alice@work.com
phone:: +1-555-1234
birthday:: 12-24
company:: Acme Corp
role:: Engineering Lead
```

Structured extraction from frontmatter/properties into SPO triples is free (parsing, no LLM). NL extraction from prose requires LLM (~$0.04/session).

## Promotion: SPO → Markdown Node

Triples live in SQLite by default. Promotion creates a markdown file when knowledge should be human-visible:

- **Manual**: `km memory promote <subject>` creates a markdown node from all triples about that subject
- **Automatic**: High-confidence entities (e.g., contacts from CardDAV sync) auto-promote to markdown
- **Agent-initiated**: Agent decides "this is worth a note" and creates a node

Promotion creates an event → normal km flow → markdown file.

The reverse direction — editing a promoted markdown node and syncing changes back to the triple store — is handled by **Phase 6: Node Derivation**. This closes the loop: triples can become nodes (promotion), and node edits can update triples (derivation).

## Failure Modes

Production agent memory systems encounter these failure modes:

| Failure Mode | Mitigation |
|-------------|------------|
| **Stale facts** | `superseded_by` field + recency preference in ranking |
| **Context clash** (conflicting triples) | Bi-temporal validity, conflict detection |
| **Category drift** | Hybrid heuristic+LLM categorization, validation rules |
| **Over-remembering** | TTL on session-sourced triples (30 days), periodic pruning |
| **Retrieval mismatch** | Embeddings (Phase 2) for semantic matching |

Memory hygiene built in from day one: TTL for ephemeral triples, agent triples persist until retracted, periodic summarization of old events.

## Current State

**Implemented:**
- **Nodes, storage, sync** — the five-layer architecture ([architecture.md](../architecture.md))
- **CalDAV/CardDAV client** — `@km/connector-caldav` package with vCard/iCal parsing ([services.md](../future/services.md))
- **Agent runtime** — `@km/agent` package with harnesses, sessions, work queues ([agents.md](../future/agents.md))
- **Session recall** — FTS5-indexed search across Claude Code session history (`bun recall`)

**Planned** (described in this document):
- SPO memory layer (`packages/km-memory/` — not yet created)
- Event source abstraction (node edits work; session/git/sync sources are planned)
- Entity schemas and shaping
- Promotion (SPO → markdown nodes)

## Implementation Roadmap

### Prototype (validate core assumption)
- SPO table + recall/remember/retract CLI commands
- ENGRAM per-category retrieval
- Test with real Claude Code sessions
- Success metric: agent produces useful triples, recall beats current FTS5-only approach

### Phase 1: Statements + Agent Tools
Core SPO schema, StatementStore, agent tools, keyword search

### Phase 2: Embeddings
Semantic search, handles query/storage phrasing mismatch

### Phase 3: Entity Shaping
Deterministic projection: statements → typed entities (Contact, Event, Task)

### Phase 4: Confidence Accumulation
Multi-source corroboration, contradiction handling

### Phase 5: Sync Adapters
CardDAV, CalDAV, Google (builds on entity shaping + existing `@km/connector-caldav`)

### Phase 6: Node Derivation
Markdown → SPO triples (structured extraction from frontmatter/links/tags)

### Phase 7: Promotion
SPO → markdown nodes (manual + automatic)

### Phase 8: Unified Query
repo.query() + SPO store merged via RRF

## Appendix: PIM Lineage

km's brain layer absorbs designs from two earlier projects in the PIM monorepo:

- **kimmi** — a contacts/calendar CRDT sync project. km absorbs its sync adapters (CardDAV, CalDAV) as event sources and entity schemas.
- **cloudi** — an experimental AI memory system. km absorbs its SPO triple store design, cognitive type separation, and confidence accumulation. The full specification lives in Cloudi ADR01 (`~/Code/pim/cloudi/specs/active/ADR01/`; internal, requires cloudi repo checkout).

The PIM ecosystem simplifies to two things:

| | **km** (brain) | **pam** (channels) |
|---|---|---|
| **Purpose** | Knowledge engine | Multi-channel AI assistant |
| **Absorbs** | kimmi (sync), cloudi (memory) | cloudi (channels) |
| **Contains** | Nodes, SPO memory, entity sync, search | Channel adapters, security harness, conversation state |
| **Interface** | Library, CLI, MCP, TUI | WhatsApp, email, Telegram, web |

## References

- [memory-systems-analysis.md](../explorations/memory-systems-analysis.md) — ENGRAM/AutoMem/Hindsight research evaluation
- [ENGRAM paper](https://openreview.net/forum?id=D7WqEZzwRR) (ICLR 2026) — cognitive type separation, +31% accuracy
- [Letta benchmark](https://www.letta.com/blog/benchmarking-ai-agent-memory) — filesystem memory (74% LoCoMo) > Mem0 graph (68.5%)
- [Hindsight](https://arxiv.org/abs/2512.12818) — 91.4% LongMemEval, multi-pathway RRF

## See Also

- [../architecture.md](../architecture.md) — km system architecture (layers, data flow, events)
- [../future/services.md](../future/services.md) — CalDAV/CardDAV connectors
- [../explorations/plain-brain.md](../explorations/plain-brain.md) — original exploration (graduated to this doc)
