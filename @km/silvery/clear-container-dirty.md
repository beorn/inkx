---
id: "@km/silvery/clear-container-dirty"
aliases:
  - km-silvery.clear-container-dirty
  - km-silvery-clear-container-dirty
created_by: claude:c9beade3
created_at: 2026-03-13T14:48:01Z
closed_at: 2026-03-13T18:06:00Z
close_reason: Fixed with TDD tests, all passing (1215 fuzz + unit)
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] clearContainer() missing dirty invalidation — stale UI after root clear @km/silvery #bug #P1 @claude:c9beade3

GPT 5.4 Pro re-review finding H1. clearContainer() removes children and frees layout nodes but does NOT set root.childrenDirty/contentDirty/layoutDirty or call markSubtreeDirty(root). Unlike other mutation methods (appendChildToContainer, removeChildFromContainer), it skips all invalidation. Can leave stale buffer/tree mismatch after root clear. Fix: mirror removeChildFromContainer dirty semantics.