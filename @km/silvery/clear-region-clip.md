---
id: "@km/silvery/clear-region-clip"
aliases:
  - km-silvery.clear-region-clip
  - km-silvery-clear-region-clip
created_by: claude:c9beade3
created_at: 2026-03-13T04:30:18Z
closed_at: 2026-03-13T04:51:47Z
close_reason: "False positive: clearNodeRegion correctly clips to parent
  contentRect (content area). Code is correct."
---

# [x] clearNodeRegion clips to parent full rect, not parent content area @km/silvery #bug #P2

Vertical clipping uses parentRect.y + parentRect.height but doesn't inset for parent border/padding. Can write into parent bottom border/padding rows during child shrink. Already fixed in clearExcessArea but not clearNodeRegion. Found by GPT pipeline review.