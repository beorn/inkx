---
mentions:
  - km
id: "@km/storage/sqlite-store"
aliases:
  - km-storage.sqlite-store
  - km-storage-sqlite-store
created_by: Bjørn Stabell
created_at: 2026-04-03T05:39:02Z
closed_at: 2026-04-03T07:16:28Z
close_reason: Implemented createSQLiteStore(db) in sqlite-store.ts with full
  test coverage (13 tests). Exports added to barrel.
owner: bjorn@stabell.org
---

# [x] Phase 3: createSQLiteStore — Store + Reactive + Persistent @km/storage #task #P3

## Goal: Formalize SQLite as authority store

Current: SQLite is already the persistence layer (via bun:sqlite + Emitter).
Target: createSQLiteStore(db) that directly implements Store & Observable & Persistent.

### Key changes

- SQLite store reads directly from DB (not through Repo abstraction)
- Memory store becomes a reactive cache (withReactive wraps SQLite store)
- On startup: hydrate from SQLite, emit loading → loaded transitions
- All mutations go through SQLite first, then propagate to cache

### Blocked on

- Step 4 (store-sync) — need commit subscriber pattern first
- Decision: whether to keep Repo as compatibility layer or migrate callers

