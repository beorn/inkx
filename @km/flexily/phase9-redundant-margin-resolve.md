---
id: "@km/flexily/phase9-redundant-margin-resolve"
aliases:
  - km-flexily.phase9-redundant-margin-resolve
  - km-flexily-phase9-redundant-margin-resolve
created_by: claude:65d845d9
created_at: 2026-03-13T05:32:04Z
closed_at: 2026-03-13T05:32:38Z
close_reason: P4 optimization — tracked but not blocking. Margin re-resolve is
  redundant but not harmful.
owner: bjorn@stabell.org
---

# [x] Phase 9 re-resolves margins that are already cached in child.flex @km/flexily #task #P4

In layout-zero.ts Phase 9 (shrink-wrap cross-axis, lines 1595-1604), margins are re-resolved via resolveEdgeValue() calls even though Phase 5 already cached all 4 margins on child.flex (marginL/T/R/B). Using the cached values would avoid 2*N resolveEdgeValue calls per relative child during cross-axis shrink-wrap. Same issue in Phase 9b (re-stretch, lines 1681-1684). Minor performance improvement, significant for trees with many children. [pro]