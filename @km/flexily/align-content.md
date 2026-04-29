---
id: "@km/flexily/align-content"
aliases:
  - km-flexily.align-content
  - km-flexily-align-content
created_by: claude:474834b0
created_at: 2026-03-10T03:43:33Z
closed_at: 2026-03-10T04:18:36Z
close_reason: "Fixed Phase 7a fallback in layout-zero.ts: calls cachedMeasure
  for auto-sized children with measureFunc instead of equal-dividing all cross
  space. 4 tests added. All 1408 flexily tests pass."
---

# [x] alignContent ignored when children use measureFunc @km/flexily #bug #P2

Phase 7a fallback divides container evenly among lines when children are auto-sized (measureFunc), consuming ALL free space. Phase 7b alignContent then has zero free space to distribute.

Repro: Box width=2 height=6 flexWrap=wrap flexDirection=row alignContent=X with 4 Text children. Every alignContent value produces y=[0,0,3,3]. Expected for flex-start: y=[0,0,1,1].

Root cause in layout-zero.ts:838 — fallbackCross = crossAxisSize/numLines = 6/2 = 3. Children with measureFunc get childCross=0, so maxLineCross=0, triggering fallback. Fix: call measureFunc in Phase 7a for tentative cross size.