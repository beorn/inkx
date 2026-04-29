---
id: "@km/silvery/hvl-ceil-overflow"
aliases:
  - km-silvery.hvl-ceil-overflow
  - km-silvery-hvl-ceil-overflow
created_by: claude:65d845d9
created_at: 2026-03-13T06:46:08Z
closed_at: 2026-03-13T06:46:10Z
close_reason: "Fixed: calcActualVisibleCount uses floor semantics, rendering
  loop stops before overflow. 25 tests added (boundary parametric + property
  invariants)."
owner: bjorn@stabell.org
assignee: claude:65d845d9
---

# [x] HVL calcActualVisibleCount uses ceil — layout corruption at boundary widths @km/silvery #bug #P1 @claude:65d845d9

At specific terminal widths where ceil(viewport/itemWidth) equals total item count, HVL renders all items with flexShrink=0 in a container too small to hold them, causing layout corruption. Example: 280 cols, 8 columns × 39 chars → ceil(278/39)=8 but only 7 fully fit. Fix: floor semantics for visible count, stop rendering loop before overflow.