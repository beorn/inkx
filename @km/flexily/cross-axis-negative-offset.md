---
mentions:
  - km
id: "@km/flexily/cross-axis-negative-offset"
aliases:
  - km-flexily.cross-axis-negative-offset
  - km-flexily-cross-axis-negative-offset
created_by: claude:c9beade3
created_at: 2026-03-13T05:25:23Z
closed_at: 2026-03-13T05:37:23Z
close_reason: "Fixed: Changed crossOffset guard from '> 0' to '\\!== 0' so
  negative offsets are applied. When a child is larger than the container's
  cross axis, alignment (center/flex-end) produces a negative offset that must
  be applied for correct positioning. Previously clamped to 0. Fixed in both
  layout-zero.ts and classic/layout.ts. Test:
  vendor/flexily/tests/absolute-positioning.test.ts (4 tests in 'cross-axis
  negative offset' describe block)."
owner: bjorn@stabell.org
---

# [x] Bug: Cross-axis alignment drops negative offsets — oversized children misplaced @km/flexily #bug #P0

