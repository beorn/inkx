---
mentions:
  - km
id: "@km/flexily/wrap-hypothetical-size"
aliases:
  - km-flexily.wrap-hypothetical-size
  - km-flexily-wrap-hypothetical-size
created_by: claude:c9beade3
created_at: 2026-03-13T05:25:14Z
closed_at: 2026-03-13T05:43:46Z
close_reason: "Fixed: breakIntoLines() now uses hypothetical main size (clamped
  to min/max) instead of unclamped base size, per CSS spec 9.3.4. Changed
  layout-flex-lines.ts and classic/layout.ts. Test:
  vendor/flexily/tests/css-spec-fixes.test.ts (3 tests)"
owner: bjorn@stabell.org
---

# [x] Bug: Flex-wrap line breaking uses baseSize not hypothetical main size @km/flexily #bug #P0

