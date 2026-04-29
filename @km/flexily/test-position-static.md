---
id: "@km/flexily/test-position-static"
aliases:
  - km-flexily.test-position-static
  - km-flexily-test-position-static
created_by: claude:65d845d9
created_at: 2026-03-13T05:32:29Z
closed_at: 2026-03-13T05:35:25Z
---

# [x] Missing test coverage for POSITION_TYPE_STATIC @km/flexily #task #P3

POSITION_TYPE_STATIC (value 0) is defined in constants.ts and exported, but has zero test coverage across all test files. No test sets positionType to STATIC or verifies its behavior. This compounds the static-position-offsets bug: not only is the behavior wrong, but there's no test to catch it. Add tests verifying: (1) static children participate in flex layout like relative ones, (2) position offsets (left/top/right/bottom) are ignored for static children, (3) static children don't create a positioning context for absolute descendants. [pro]