---
mentions:
  - km
id: "@km/storage/displaced-delete"
aliases:
  - km-storage.displaced-delete
  - km-storage-displaced-delete
created_by: Bjørn Stabell
created_at: 2026-04-02T20:51:17Z
closed_at: 2026-04-02T21:58:52Z
close_reason: "Fixed: Before deleting displaced nodes during rename
  reconciliation, now verifies the node is stale by comparing DB inode vs FS
  inode. Concurrent creations with no tracked inode are preserved (rename
  skipped). 3 new tests. Commit 984ad8cb."
owner: bjorn@stabell.org
---

# [x] [bug] reconcile displaced-node detection can delete user content on concurrent renames @km/storage #bug #P1

Found by /big review. reconcile.ts:82-104: If two renames target same path, displaced node detection deletes the existing node at that path. But if user manually created a folder with same name before rename completed, this deletes their content. Fix: verify not concurrent rename before deletion, or emit event instead of delete op.

