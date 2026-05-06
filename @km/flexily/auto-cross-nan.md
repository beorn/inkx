---
mentions:
  - km
  - claude
id: "@km/flexily/auto-cross-nan"
aliases:
  - km-flexily.auto-cross-nan
  - km-flexily-auto-cross-nan
created_by: claude:c9beade3
created_at: 2026-03-13T15:10:26Z
closed_at: 2026-03-13T18:06:00Z
close_reason: Fixed with TDD tests, all passing (1215 fuzz + unit)
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] Cross-axis alignment in auto-sized containers produces NaN offsets @km/flexily #bug #P1 @claude:c9beade3

GPT 5.4 Pro re-review P1. When parent cross size is NaN (auto), availableCrossSpace becomes NaN, so ALIGN_CENTER, ALIGN_FLEX_END, and cross-axis auto margins compute NaN offsets. Phase 9b only revisits ALIGN_STRETCH, not center/flex-end. Repro: row container with height:auto and alignItems:center.

