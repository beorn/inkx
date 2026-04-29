---
id: "@km/flexily/static-position-type"
aliases:
  - km-flexily.static-position-type
  - km-flexily-static-position-type
created_by: claude:c9beade3
created_at: 2026-03-13T05:25:12Z
closed_at: 2026-03-13T05:43:42Z
close_reason: "Fixed: POSITION_TYPE_STATIC no longer applies position insets
  (top/left/right/bottom). Changed conditions in layout-zero.ts (lines 281,
  1254) and classic/layout.ts (lines 531, 1268) to only check
  POSITION_TYPE_RELATIVE. Test: vendor/flexily/tests/css-spec-fixes.test.ts (4
  tests)"
owner: bjorn@stabell.org
---

# [x] Bug: POSITION_TYPE_STATIC applies offsets like relative — should ignore insets @km/flexily #bug #P0
