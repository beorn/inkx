---
id: "@km/storage/delete-orphans"
aliases:
  - km-storage.delete-orphans
  - km-storage-delete-orphans
created_by: claude:c9beade3
created_at: 2026-03-13T06:22:58Z
closed_at: 2026-03-13T07:09:34Z
close_reason: "Fixed in Pro Review Round 1: recursive CTE delete, link
  disambiguation, section-scoped resolution, rename target scoping, cache
  invalidation on mutations, phrase search, negated ref scoping, compaction
  dependency preservation. All with TDD (31 new tests)."
---

# [x] Non-recursive deletes leave orphaned subtrees and stale links @km/storage #bug #P0 @claude:c9beade3

deleteNodeImpl does DELETE FROM nodes WHERE id = ? only. No recursive delete, no ON DELETE CASCADE, no link cleanup. Delete events emit data:{}, so FS sync can't propagate deletion either (node already gone from DB). Two related P0s: orphaned subtrees + delete events can't reach filesystem.