---
id: "@km/_orphan/t24yh"
aliases:
  - km-t24yh
created_by: claude:97b8de73
created_at: 2026-02-22T20:57:18Z
closed_at: 2026-02-22T22:14:51Z
---

# [x] 10s+ startup freeze: preloadSubtree called twice, no progress @km/_orphan #bug #P1

computeDefaultFolds() and useColumns() both call preloadSubtree() with recursive CTE that returns 100k+ rows on 333k-node tree. Two massive SQL queries before first render. No progress indicator shown during this phase.