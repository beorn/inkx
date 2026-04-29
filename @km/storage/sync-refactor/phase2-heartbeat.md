---
id: "@km/storage/sync-refactor/phase2-heartbeat"
aliases:
  - km-storage.sync-refactor.phase2-heartbeat
  - km-storage-sync-refactor-phase2-heartbeat
created_by: Bjørn Stabell
created_at: 2026-04-02T23:02:58Z
closed_at: 2026-04-02T23:49:22Z
close_reason: Shipped 460bae4d
---

# [x] Phase 2: Extract heartbeat to createHeartbeat() factory @km/storage #task #P2

Extract heartbeat methods (start/stop/run/force/diagnostics/reprojectDirtyPaths) from SyncManager into heartbeat.ts factory. ~100 LOC removed from SyncManager.