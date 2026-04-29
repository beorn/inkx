---
id: "@km/_orphan/my5p7"
aliases:
  - km-my5p7
created_by: claude:97b8de73
created_at: 2026-02-22T20:57:19Z
closed_at: 2026-02-22T22:14:51Z
owner: bjorn@stabell.org
---

# [x] l/h navigation freezes 2-5s: useColumns re-runs on every cursor move @km/_orphan #bug #P1

useColumns() subscribes to repoVersion which changes on ANY repo mutation. Even cursor-only moves trigger full column derivation + preloadSubtree(). useMemo deps too broad.