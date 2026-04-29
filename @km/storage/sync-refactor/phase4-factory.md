---
id: "@km/storage/sync-refactor/phase4-factory"
aliases:
  - km-storage.sync-refactor.phase4-factory
  - km-storage-sync-refactor-phase4-factory
created_by: Bjørn Stabell
created_at: 2026-04-02T23:03:00Z
closed_at: 2026-04-02T23:49:23Z
close_reason: Shipped b41fed27
owner: bjorn@stabell.org
---

# [x] Phase 4: SyncManager class to createSyncManager() factory @km/storage #task #P2

Convert remaining SyncManager class to factory function. Drop extends EventEmitter, use typed callbacks. Update 4 production consumers + test helper. Depends on phases 1-3.