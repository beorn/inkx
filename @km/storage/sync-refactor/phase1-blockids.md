---
mentions:
  - km
id: "@km/storage/sync-refactor/phase1-blockids"
aliases:
  - km-storage.sync-refactor.phase1-blockids
  - km-storage-sync-refactor-phase1-blockids
created_by: Bjørn Stabell
created_at: 2026-04-02T23:02:57Z
closed_at: 2026-04-02T23:49:21Z
close_reason: Shipped 36e775f1
owner: bjorn@stabell.org
---

# [x] Phase 1: Deduplicate createBlockIdAssigner @km/storage #task #P2

Extract createBlockIdAssigner from SyncManager and EventHandlers into shared code. Delete duplicate in SyncManager. EventHandlers already has db/repoPath context.

