---
id: "@km/flexily/measure-rtl-direction"
aliases:
  - km-flexily.measure-rtl-direction
  - km-flexily-measure-rtl-direction
created_by: claude:c9beade3
created_at: 2026-03-13T05:25:34Z
closed_at: 2026-03-13T05:43:39Z
close_reason: "Fixed: 3 measureNode() calls in layout-zero.ts (Phase 5 base
  size, Phase 7 baseline, Phase 7a cross-size) were missing the direction
  parameter, defaulting to LTR. This caused wrong EDGE_START/EDGE_END
  margin/padding resolution in RTL, producing incorrect baseSize when both
  logical and physical edges were set. Test:
  vendor/flexily/tests/measure-rtl-direction.test.ts (3 tests)"
---

# [x] Bug: measureNode() called without direction in RTL-sensitive paths @km/flexily #bug #P0
