---
id: "@km/tools/recall-enhance"
aliases:
  - km-tools.recall-enhance
  - km-tools-recall-enhance
created_by: claude:1d8b0fc3
created_at: 2026-02-15T16:02:10Z
owner: bjorn@stabell.org
---

# [ ] Agent memory: implement Cloudi ADR01 SPO memory system for km @km/tools #feature #P4

Implement Cloudi's ADR01 memory system as a core km package. Cloudi integrates into km — km becomes the unified PIM brain holding contacts, calendar, tasks, notes, and agent memory. Cloudi's channels (WhatsApp, email) are bodies that connect to km's brain.

## Vision

km is the externalized brain for both humans and AI agents. The SPO triple store provides:
- **Agent memory**: recall/remember/retract across sessions
- **Entity modeling**: Contacts, Events, Tasks as schema'd entities
- **External sync**: CardDAV, CalDAV, Google via entity shaping
- **Cognitive type separation**: ENGRAM fact/event/instruction/decision for retrieval
- **Human visibility**: Important triples promoted to markdown nodes, editable by humans

## Architecture

```
┌──────────┐  ┌───────────┐  ┌───────────┐  ┌──────────┐
│ TUI/CLI  │  │Claude Code│  │  Cloudi    │  │ Obsidian │
│ (human)  │  │  (agent)  │  │ channels  │  │ (human)  │
└────┬─────┘  └─────┬─────┘  └─────┬─────┘  └────┬─────┘
     └──────────┬───┴──────────────┴──────────────┘
                │
     ┌──────────▼──────────────────────────────────┐
     │  km (the brain)                              │
     │  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
     │  │  Nodes   │  │  Memory  │  │   Sync    │  │
     │  │(markdown)│  │(SPO store│  │ (CardDAV, │  │
     │  │          │  │ + entity │  │  CalDAV,  │  │
     │  │          │  │ shaping) │  │  Google)  │  │
     │  └──────────┘  └──────────┘  └───────────┘  │
     └──────────────────────────────────────────────┘
```

## Why Full SPO (Not Just Tagged Text)

Tagged text entries with cognitive types would suffice for agent memory alone. But km needs SPO because:
- **Entity sync** requires decomposing contacts/events into fields (CardDAV, CalDAV)
- **Entity shaping** projects statements into typed objects (Contact, Event, Task)
- **Relationship queries** enable "who attended meeting X?" or "what does Alice work on?"
- **Bi-temporal validity** tracks when facts were true vs when recorded (essential for contacts that change jobs)
- **Shared schema with Cloudi** — one memory system, multiple bodies

## Cloudi ADR01 Spec (Foundation)

11 spec documents covering:
- Statement schema (SPO triples with ENGRAM cognitive types)
- Transcript vs Operation source types
- Schema-guided LLM extraction pipeline
- Entity shaping (deterministic projection: statements → typed entities)
- Confidence accumulation (corroboration formula)
- Agent tools (recall/remember/retract)
- Per-category retrieval algorithm
- Token budget system for context injection
- Bi-temporal validity model
- Sync architecture (entity adapters)

Location: ~/Code/pim/cloudi/specs/active/ADR01/

## km-Specific Additions

- **Node-derived triples**: Parse markdown frontmatter, links, tags into SPOs (free, like backlinks)
- **Contact/Calendar nodes**: Schema'd markdown with inline properties, synced via entity shaping
- **Triple→node promotion**: Important triples become markdown nodes (human curation)
- **Developer entity schemas**: Project, Codebase, Function, Bug, Pattern
- **Integration with repo.query()**: Unified search across nodes + SPO store

## Entity Schemas

| Entity | Source | Sync Target |
|--------|--------|-------------|
| Contact | markdown nodes, Cloudi channels, CardDAV import | CardDAV, Google Contacts |
| Event | markdown nodes, Cloudi channels, CalDAV import | CalDAV, Google Calendar |
| Task | km task nodes, Cloudi channels | (internal) |
| Project | km project nodes | (internal) |
| Code | session extraction, git logs | (internal) |

## Failure Modes to Plan For (from deep research)

1. **Stale facts**: superseded_by + recency preference
2. **Context clash**: bi-temporal validity, conflict detection
3. **Category drift**: hybrid heuristic+LLM categorization
4. **Over-remembering**: periodic summarization/pruning
5. **Retrieval mismatch**: embeddings (Phase 2) for semantic matching

## Implementation Phases (Cloudi ADR01)

1. **Statements**: SPO schema, StatementStore, keyword search, agent tools
2. **Embeddings**: Semantic search, per-category retrieval (ENGRAM ≥77%)
3. **Entities**: EntityStore, entity shaping, typed projections
4. **Confidence**: Multi-source corroboration, contradiction handling
5. **Sync**: Entity adapters (CardDAV, CalDAV, Google)

Plus km integration:
6. **Node derivation**: Markdown → SPO triples
7. **Promotion**: SPO → markdown nodes
8. **Unified query**: repo.query() + SPO store merged via RRF

## Package Location

New shared package: `packages/km-memory/` (or `packages/memory/`)
- Core: SPO schema, stores, retrieval, tools (shared with Cloudi)
- km adapter: SQLite backend, node integration, markdown sync
- Cloudi adapter: channel integration, external sync

## Research

- Cloudi ADR01: ~/Code/pim/cloudi/specs/active/ADR01/ (11 documents)
- ENGRAM (ICLR 2026): cognitive type separation = +31% accuracy
- Hindsight: 91.4% LongMemEval, multi-pathway RRF
- Letta benchmark: filesystem memory works for agents (74% LoCoMo)
- Deep research (O3, 2026-02-15): failure modes, hybrid ingestion, production system comparison
- plain-brain.md: brain/body architecture
- memory-systems-analysis.md: ENGRAM/AutoMem/Hindsight comparison