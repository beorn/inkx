---
id: "@km/flexily/wrapped-line-cross"
aliases:
  - km-flexily.wrapped-line-cross
  - km-flexily-wrapped-line-cross
created_by: claude:c9beade3
created_at: 2026-03-13T15:10:30Z
closed_at: 2026-03-13T18:06:00Z
close_reason: Fixed with TDD tests, all passing (1215 fuzz + unit)
---

# [x] Wrapped line cross sizes measured against parent width instead of child resolved mainSize @km/flexily #bug #P1 @claude:c9beade3

GPT 5.4 Pro re-review P1. Phase 7a estimates line cross sizes using parent width instead of each child resolved flex.mainSize, so line heights underestimated for wrapped text, causing line overlap.