---
id: "@km/storage/split-sync-manager"
aliases:
  - km-storage.split-sync-manager
  - km-storage-split-sync-manager
created_by: Bjørn Stabell
created_at: 2026-04-02T22:01:15Z
closed_at: 2026-04-02T22:30:11Z
close_reason: "Shipped: ReconciliationEngine extracted (195 LOC). SyncManager
  reduced from 947→790 LOC. Engine handles isOwnedWrite, filterOwnedWriteOps,
  recordObservations, reconcile/apply. No circular imports. Commit 06b0e442."
---

# [x] Split SyncManager (854 LOC) into 3 focused components @km/storage #task #P2

SyncManager is a god object with 9+ responsibilities: watcher lifecycle, reconciliation, heartbeat, write tokens, event projection, parse pool, block ID assignment, state machine, in-flight tracking.

DESIGN: Split into:
1. WatcherManager — watcher lifecycle, batching, in-flight deduplication
2. ReconciliationEngine — FS→DB diff+apply, pure, no write-back logic
3. ProjectionManager — DB→FS via EventHandlers, WriteQueue, conflict resolution

Each component has clear inputs/outputs and can be tested independently.