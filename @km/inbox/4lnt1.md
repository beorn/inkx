---
mentions:
  - km
id: "@km/inbox/4lnt1"
aliases:
  - km-4lnt1
  - "@km/_orphan/4lnt1"
created_at: 2026-02-05T01:49:28Z
closed_at: 2026-02-05T01:51:29Z
---

# [x] Link: SurrealDB memory prototype in cloudi @km/_orphan #chore #P4

Cross-repo reference to cloudi-8pj: Prototype AutoMem-like memory system using SurrealDB

## Location

- Repo: ../cloudi
- Bead: cloudi-8pj

## Context

Research session in km comparing AI agent memory systems:

- AutoMem (FalkorDB + Qdrant) - 90% LoCoMo
- Hindsight (ENGRAM-style) - 91% LongMemEval
- mcp-memory-service (SQLite) - ~70% estimated
- episodic-memory (SQLite) - ~60% estimated

SurrealDB identified as optimal single-DB alternative (~85-90% quality, much simpler ops).

## View the full bead

```bash
cd ../cloudi && bd show cloudi-8pj
```

