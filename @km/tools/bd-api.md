---
mentions:
  - km
id: "@km/tools/bd-api"
aliases:
  - km-tools.bd-api
  - km-tools-bd-api
created_by: claude:73c2828f
created_at: 2026-02-15T13:05:53Z
owner: bjorn@stabell.org
---

# [ ] Spec: km bd CLI wrapper covering full bd API surface @km/tools #feature #P4

The `bun km bd` CLI wrapper currently exposes a limited subset of bd's API. With bd v0.50+ adding many new commands (query, search, rename, defer, comments, delete, count, stale, find-duplicates, epic management, wisps, molecules, swarms, agents, gates, etc.), spec out what km bd should expose.

## Scope

Audit the full bd v0.50 command surface and determine:

1. Which commands should be proxied through `bun km bd` vs used via standalone `bd`
2. Whether km bd adds value over standalone bd (e.g., project-aware defaults, TUI integration)
3. What @km/_orphan/specific conveniences km bd could provide (e.g., auto-scope to km- prefix, auto-parent to tracking epic)

## Key Questions

- Should km bd be a thin proxy or add @km/_orphan/specific intelligence?
- Should it auto-detect scope from cwd (e.g., in vendor/ → use that prefix)?
- Should it integrate with the TUI (e.g., `bun km bd list` renders in TUI)?
- Is the standalone `bd` sufficient and km bd should be deprecated?

## bd v0.50 Major Commands to Consider

- Core CRUD: create, update, close, show, list, delete, rename
- Query: query (boolean DSL), search (text), count (grouped)
- Workflow: ready, blocked, stale, defer/undefer, comments
- Hierarchy: children, epic (status, close-eligible), dep
- Detection: find-duplicates, duplicates
- Advanced: agent, slot, gate, mol, swarm, formula, promote
- Modes: --no-db, --readonly, --sandbox, Dolt backend

