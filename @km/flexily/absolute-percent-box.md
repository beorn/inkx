---
id: "@km/flexily/absolute-percent-box"
aliases:
  - km-flexily.absolute-percent-box
  - km-flexily-absolute-percent-box
created_by: claude:c9beade3
created_at: 2026-03-13T05:25:35Z
closed_at: 2026-03-13T05:37:20Z
close_reason: "Fixed: Absolute percent position offsets now resolve against
  content box dimensions (absContentBoxW/absContentBoxH) instead of border box
  (nodeWidth/nodeHeight), matching Yoga behavior. Verified with Yoga comparison
  tests. Fixed in both layout-zero.ts and classic/layout.ts. Note: the bead
  description said 'padding box' but Yoga actually resolves against content box.
  Test: vendor/flexily/tests/absolute-positioning.test.ts (3 tests in 'absolute
  percent offsets' describe block)."
owner: bjorn@stabell.org
---

# [x] Bug: Absolute percent offsets resolve against border box, not padding box @km/flexily #bug #P0
