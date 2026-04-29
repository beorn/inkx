---
id: "@km/_orphan/flexx-wrap-justify"
aliases:
  - km-flexx-wrap-justify
created_at: 2026-01-31T21:00:26Z
closed_at: 2026-01-31T21:08:35Z
assignee: claude:b8b4780b
---

# [x] Fix multi-line wrap: justify-content computed globally instead of per-line @km/_orphan #bug #P1 @claude:b8b4780b

In flex-wrap layouts, justify-content and auto margins are computed globally across all lines instead of per-line as CSS spec requires. This causes incorrect positioning in multi-line wrapped layouts. The pre-allocated arrays _lineJustifyStarts and _lineItemSpacings are declared but unused.