---
id: "@km/domain/2-phase-2-datastore-interface-factories"
aliases:
  - km-domain.2
  - km-domain-2
  - "@km/domain/2"
created_at: 2026-01-25T23:36:36Z
closed_at: 2026-01-26T08:13:02Z
---

# [x] Phase 2: DataStore interface + factories @km/domain #task #P2 @claude-session

Create DataStore interface and factory functions:
- DataStore interface with getNode, getChildren, getAllNodes, search, addNode, updateNode, deleteNode, moveNode
- Capability interfaces: EventSourced, HasDatabase
- Factories: createMapDataStore (pure Maps), createMemDataStore (SQLite :memory:), createDBDataStore (wraps existing db)
- Update withTestEnv to provide data: DataStore for ergonomic test access
- Migrate tests to use data.getAllNodes() instead of getAllNodes(db)