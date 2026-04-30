---
id: "@km/inbox/9fll"
aliases:
  - km-9fll
  - "@km/_orphan/9fll"
created_at: 2026-01-20T14:30:59Z
closed_at: 2026-01-20T14:40:57Z
---

# [x] Review calcScrollOffset utility redundancy @km/_orphan #task #P3

calcScrollOffset in vendor/beorn-tui-measure/src/index.ts (lines 91-103) provides simpler scroll offset calculation. However calculateScrollState provides more complete functionality. Consider: remove calcScrollOffset, or document why both exist. Low priority since it works, just adds API surface.