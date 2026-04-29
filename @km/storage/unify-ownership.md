---
id: "@km/storage/unify-ownership"
aliases:
  - km-storage.unify-ownership
  - km-storage-unify-ownership
created_by: Bjørn Stabell
created_at: 2026-04-02T22:35:02Z
closed_at: 2026-04-03T03:32:11Z
close_reason: OwnershipTracker unifies WriteTokenMap + SyncState. 15 tests. 257
  watch tests pass.
owner: bjorn@stabell.org
---

# [x] Unify WriteTokenMap + SyncState into single OwnershipTracker @km/storage #task #P2

From /big quality review: WriteTokenMap (45 lines) and SyncState (120 lines) both track 'is this our write?' with parallel logic. isOwnedWrite() in both SyncManager and ReconciliationEngine is identical (60 lines duplicated).

FIX: Create watch/ownership-tracker.ts with single API: record(), isOurs(), renamePath(), etc. WriteTokenMap becomes the L1 cache inside OwnershipTracker, sync_state is L2. Eliminates 60 lines of duplication, one concept instead of two.