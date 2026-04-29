---
id: "@km/_orphan/laclm"
aliases:
  - km-laclm
created_by: claude:f53c94c1
created_at: 2026-03-27T23:59:04Z
closed_at: 2026-03-28T00:00:59Z
close_reason: Fixed dedup in evaluateAddRule — uses fs_path (stable) instead of
  node ID (ULID, changes every parse). Cleaned @next.md from 6296 lines of
  duplicates to skeleton. Tests pass (1021/1021).
---

# [x] km.add:: embed dedup bug — duplicates accumulate on every sync @km/_orphan #bug #P1 @claude:f53c94c1

evaluateAddRule dedup checks match.id against existingOnBoard, but node IDs are ULIDs regenerated on each parse. The same file gets a new ID each sync, so the dedup check never matches. Result: @next.md Inbox grew from ~100 items to 3140 transclusions (868x for one HN article). Need stable dedup key — fs_path or embed target path, not node ID.