---
id: "@km/flexily/wrap-auto-cross-size"
aliases:
  - km-flexily.wrap-auto-cross-size
  - km-flexily-wrap-auto-cross-size
created_by: claude:c9beade3
created_at: 2026-03-13T05:25:26Z
closed_at: 2026-03-13T05:43:53Z
close_reason: "Fixed: Phase 7a now estimates cross-size for auto-sized container
  children (no measureFunc, has children) by running measureNode with
  unconstrained dimensions. Also fixed a pre-existing bug where recursive
  layoutNode calls in Phase 8 corrupted global pre-allocated line arrays —
  multi-line data is now saved into local arrays before Phase 8. Test:
  vendor/flexily/tests/css-spec-fixes.test.ts (3 tests)"
---

# [x] Bug: Wrapped auto-sized child containers get line cross-size 0 @km/flexily #bug #P0
