---
id: "@km/flexily/align-content-negative"
aliases:
  - km-flexily.align-content-negative
  - km-flexily-align-content-negative
created_by: claude:c9beade3
created_at: 2026-03-13T05:25:25Z
closed_at: 2026-03-13T05:43:45Z
close_reason: "Fixed: alignContent guard condition (freeSpace > 0) blocked
  flex-end, center, and space-around from applying with negative free space
  (lines overflowing container). Now flex-end/center apply with any freeSpace,
  space-around/evenly collapse to center with negative space, space-between
  collapses to flex-start. Verified against Yoga 3.x behavior. Test:
  vendor/flexily/tests/align-content-negative.test.ts (7 tests)"
---

# [x] Bug: alignContent ignores negative free space — multi-line overflow alignment wrong @km/flexily #bug #P0
