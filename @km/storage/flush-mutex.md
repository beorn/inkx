---
id: "@km/storage/flush-mutex"
aliases:
  - km-storage.flush-mutex
  - km-storage-flush-mutex
created_by: Bjørn Stabell
created_at: 2026-04-02T20:51:19Z
closed_at: 2026-04-02T21:58:53Z
close_reason: "Fixed: (1) flushGeneration map pruned when exceeding 10K entries,
  cleared on queue teardown. (2) flush() now re-drains pending items accumulated
  during doFlush, preventing orphaned writes. 2 new tests. Commits 5389b100,
  940c4340."
---

# [x] [bug] WriteQueue flush mutex incomplete — race between flush() and queue() @km/storage #bug #P2

Found by /big review. writequeue.ts:313+: flushPromise prevents concurrent flushes but doesn't prevent new queue() calls during flush. If flush clears pending, new queue() adds write, completed flush misses it. Also flushGeneration Map grows unbounded (never cleaned).