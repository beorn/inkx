---
id: "@km/silvery/overflow-clear-clip"
aliases:
  - km-silvery.overflow-clear-clip
  - km-silvery-overflow-clear-clip
created_by: claude:c9beade3
created_at: 2026-03-13T04:30:21Z
closed_at: 2026-03-13T04:51:48Z
close_reason: "False positive: clearDescendantOverflowRegions correctly uses
  full rect (not content area) — overflow extends beyond layout box by
  definition."
owner: bjorn@stabell.org
---

# [x] clearDescendantOverflowRegions uses ancestor full rect, not content area @km/silvery #bug #P2

Overflow clearing beyond ancestor rect doesn't account for border/padding semantics. Can over-clear into border areas or fail to clear correctly when clip bounds and border/padding interact. Especially suspicious with grandchild overflow + bordered ancestor + clipping. Found by GPT pipeline review.