---
id: "@km/_orphan/storage-4"
aliases:
  - km-storage-4
created_at: 2026-01-20T11:24:11Z
closed_at: 2026-01-27T20:38:07Z
---

# [x] Performance tracing for cursor movement @km/_orphan #task #P3 @claude:cacac722

Performance is not great when cursoring through items. Need to:
1. Add performance tracing to identify bottlenecks
2. Check if we're re-rendering everything on each keystroke
3. Identify opportunities for memoization
4. Make cursor movement much snappier

Investigation areas:
- React re-render triggers
- inkx layout recalculations
- Storage/state updates on cursor move