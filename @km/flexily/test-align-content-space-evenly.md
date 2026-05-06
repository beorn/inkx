---
mentions:
  - km
id: "@km/flexily/test-align-content-space-evenly"
aliases:
  - km-flexily.test-align-content-space-evenly
  - km-flexily-test-align-content-space-evenly
created_by: claude:65d845d9
created_at: 2026-03-13T05:32:21Z
closed_at: 2026-03-13T05:35:26Z
owner: bjorn@stabell.org
---

# [x] Missing test coverage for alignContent: SPACE_EVENLY @km/flexily #task #P3

ALIGN_SPACE_EVENLY is implemented for alignContent in layout-zero.ts (lines 934-941) but has no test coverage. The yoga-comparison.test.ts alignContentCases array (line 494) lists flex-start, center, flex-end, space-between, space-around, and stretch, but omits space-evenly. The layout.test.ts also lacks a dedicated test for alignContent space-evenly. Add tests in both yoga-comparison and layout tests. [pro]

