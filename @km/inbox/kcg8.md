---
id: "@km/inbox/kcg8"
aliases:
  - km-kcg8
  - "@km/_orphan/kcg8"
created_at: 2026-01-20T14:30:44Z
closed_at: 2026-01-20T14:36:05Z
---

# [x] Test calculateVariableHeightScrollState @km/_orphan #task #P1

The calculateVariableHeightScrollState function in vendor/beorn-tui-measure/src/ScrollableList.tsx (lines 163-285) is 120+ lines of complex scroll logic with 3 levels of nesting. Zero test coverage. Need tests for: empty list, single item, items all fit, selected at top/middle/bottom, with/without overflow indicators, variable heights, off-screen selection.