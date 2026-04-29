---
id: "@km/flexily/measure-flex-grow"
aliases:
  - km-flexily.measure-flex-grow
  - km-flexily-measure-flex-grow
created_by: claude:c9beade3
created_at: 2026-03-13T15:10:28Z
closed_at: 2026-03-13T18:06:00Z
close_reason: Fixed with TDD tests, all passing (1215 fuzz + unit)
---

# [x] Measure-function flex items with flexGrow>0 use base size 0 instead of content size @km/flexily #bug #P1 @claude:c9beade3

GPT 5.4 Pro re-review P1. Intrinsic measurement skipped when flexGrow>0, so base size falls to padding+border (often 0). CSS spec says flex base size should be content-based regardless of flexGrow. Repro: two text nodes widths 10/20, both flexGrow:1, container 60 — should get 25/35, gets 30/30.