---
mentions:
  - km
id: "@km/storage/fswriter-delete-broken"
aliases:
  - km-storage.fswriter-delete-broken
  - km-storage-fswriter-delete-broken
created_by: Bjørn Stabell
created_at: 2026-03-31T21:31:44Z
closed_at: 2026-03-31T21:44:17Z
close_reason: "Fixed: FsWriter delete reads node info from event.data
  (snapshotted before DB delete) instead of DB lookup."
owner: bjorn@stabell.org
---

# [x] P1: FsWriter delete handling broken — node already gone from DB @km/storage #bug #P1

In emitter order, DB apply happens before fsSync. FsWriter.handleNodeDeleted() calls getNode(db, event.target) but the node is already deleted. Fix: use pre-delete snapshot from event.data (fs_path, type, parent_id, item) instead of DB lookup.

