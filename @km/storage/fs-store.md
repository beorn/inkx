---
id: "@km/storage/fs-store"
aliases:
  - km-storage.fs-store
  - km-storage-fs-store
created_by: Bjørn Stabell
created_at: 2026-04-03T05:39:06Z
closed_at: 2026-04-03T07:36:39Z
close_reason: Implemented createFsStore wrapping filesystem as Store &
  Observable. Internal in-memory SQLite DB, EventHandlers for DB→FS projection,
  ReconciliationEngine for FS→DB, BulkSync.fromFs for initial population. 10
  tests passing.
---

# [x] Phase 5: createFsStore — FS as sync peer @km/storage #task #P3

FS materialization as a store. Chokidar watcher for change detection. Markdown serialization/parsing. Replaces current SyncManager/reconciliation-engine.