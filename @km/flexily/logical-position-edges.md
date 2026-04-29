---
id: "@km/flexily/logical-position-edges"
aliases:
  - km-flexily.logical-position-edges
  - km-flexily-logical-position-edges
created_by: claude:c9beade3
created_at: 2026-03-13T05:24:57Z
closed_at: 2026-03-13T05:43:30Z
close_reason: "Fixed: EDGE_START/EDGE_END position values were stored at indices
  4/5 but never resolved. Added resolvePositionEdge() helper in
  layout-helpers.ts and used it at 3 sites in layout-zero.ts (parent relative
  offset, child relative offset, absolute child positioning). Test:
  vendor/flexily/tests/logical-position-edges.test.ts (7 tests)"
---

# [x] Bug: EDGE_START/EDGE_END positions are ignored — logical positioning broken @km/flexily #bug #P0
