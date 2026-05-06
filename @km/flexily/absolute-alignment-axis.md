---
mentions:
  - km
id: "@km/flexily/absolute-alignment-axis"
aliases:
  - km-flexily.absolute-alignment-axis
  - km-flexily-absolute-alignment-axis
created_by: claude:c9beade3
created_at: 2026-03-13T05:25:13Z
closed_at: 2026-03-13T05:37:17Z
close_reason: "Fixed: Absolute children now use direction-aware alignment. In
  row containers, X uses justifyContent (main axis) and Y uses alignItems (cross
  axis). Previously both axes used the column mapping regardless of
  flexDirection. Fixed in both layout-zero.ts and classic/layout.ts. Test:
  vendor/flexily/tests/absolute-positioning.test.ts (7 tests in 'absolute
  alignment axis' describe block)."
owner: bjorn@stabell.org
---

# [x] Bug: Absolute children use wrong fallback alignment axis in row containers @km/flexily #bug #P0

