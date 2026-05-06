---
mentions:
  - km
id: "@km/storage/sync-refactor/phase3-bulksync"
aliases:
  - km-storage.sync-refactor.phase3-bulksync
  - km-storage-sync-refactor-phase3-bulksync
created_by: Bjørn Stabell
created_at: 2026-04-02T23:02:59Z
closed_at: 2026-04-02T23:49:22Z
close_reason: Shipped 287efe40
owner: bjorn@stabell.org
---

# [x] Phase 3: Extract bulk sync to BulkSync namespace @km/storage #task #P2

Extract syncFromFs/syncToFs from SyncManager into bulk-sync.ts. Standalone functions usable from both TUI and CLI contexts. ~150 LOC removed from SyncManager.

