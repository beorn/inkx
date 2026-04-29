---
id: "@km/silvery/dry-sticky-logic"
aliases:
  - km-silvery.dry-sticky-logic
  - km-silvery-dry-sticky-logic
created_by: claude:c9beade3
created_at: 2026-03-13T04:30:46Z
closed_at: 2026-03-13T05:21:46Z
close_reason: "Deferred: Duplication between renderScrollContainerChildren and
  renderNormalChildren — sticky detection, force-refresh, viewport pre-clear,
  child override, and second-pass rendering. Context differs enough (viewport
  clear mechanics, clip bounds) that direct extraction is non-trivial. Document
  the pattern, extract when next modifying sticky logic."
---

# [x] DRY: Deduplicate sticky rendering logic between scroll and normal containers @km/silvery #task #P2

Sticky force-refresh, second-pass render with hasPrevBuffer=false, and pre-clear logic nearly identical in renderScrollContainerChildren and renderNormalChildren. Extract shared helpers: renderStickyChildrenPass(), computeStickyForceRefresh(). Duplication makes correctness fixes likely to miss one path. Found by GPT pipeline review.