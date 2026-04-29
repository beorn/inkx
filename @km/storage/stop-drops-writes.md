---
id: "@km/storage/stop-drops-writes"
aliases:
  - km-storage.stop-drops-writes
  - km-storage-stop-drops-writes
created_by: Bjørn Stabell
created_at: 2026-03-31T21:31:18Z
closed_at: 2026-03-31T21:39:20Z
close_reason: "Fixed: stop() now calls writeQueue.flush() instead of clear().
  Pending writes are flushed to disk before shutdown. Regression test added."
owner: bjorn@stabell.org
---

# [x] P0: SyncManager.stop() drops pending WriteQueue writes @km/storage #bug #P0

SyncManager.stop() calls writeQueue.clear() without flushing first. Pending writes from user edits (already persisted to events.jsonl/DB) are silently discarded. Fix: call writeQueue.forceFlush() before clear() in stop().