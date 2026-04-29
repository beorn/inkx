---
id: "@km/flexily/dry-measure-vs-layout"
aliases:
  - km-flexily.dry-measure-vs-layout
  - km-flexily-dry-measure-vs-layout
created_by: claude:65d845d9
created_at: 2026-03-13T05:31:55Z
closed_at: 2026-03-13T05:32:45Z
close_reason: P3 DRY — measureNode duplicates layoutNode Phase 3 logic but is
  intentional (different measure vs layout concerns). Extracting shared code
  would couple them.
---

# [x] DRY: measureNode duplicates ~80 lines from layoutNode Phase 3 @km/flexily #task #P3

layout-measure.ts measureNode() duplicates the dimension calculation logic from layout-zero.ts layoutNode() Phase 2-4: margin/padding/border resolution, width/height calculation, aspect ratio, min/max, content area, inner constraints, and measure function handling. Both implementations are nearly line-for-line identical. Divergence risk: changes to Phase 3 must be replicated in measureNode, and vice versa. Extract a shared 'resolveNodeDimensions()' helper that both can call. Files: src/layout-measure.ts (lines 37-157), src/layout-zero.ts (lines 185-352). Note: measureNode skips position offsets and leaf nodes without measureFunc get simpler handling, so the extraction needs to account for these differences. [pro]