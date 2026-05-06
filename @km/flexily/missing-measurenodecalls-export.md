---
mentions:
  - km
id: "@km/flexily/missing-measurenodecalls-export"
aliases:
  - km-flexily.missing-measurenodecalls-export
  - km-flexily-missing-measurenodecalls-export
created_by: claude:65d845d9
created_at: 2026-03-13T05:32:47Z
closed_at: 2026-03-13T05:39:15Z
close_reason: P4 — trivial export addition, not blocking
owner: bjorn@stabell.org
---

# [x] measureNodeCalls stat not exported from index.ts @km/flexily #task #P4

layout-stats.ts exports measureNodeCalls and incMeasureNodeCalls(), but index.ts does not re-export measureNodeCalls. The exported stats from index.ts are: layoutNodeCalls, resolveEdgeCalls, layoutSizingCalls, layoutPositioningCalls, layoutCacheHits, resetLayoutStats. Missing: measureNodeCalls. This is an API inconsistency -- all other stats are exported but this one is not. Either export it or document why it's intentionally omitted. [pro]

