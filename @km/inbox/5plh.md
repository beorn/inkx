---
id: "@km/inbox/5plh"
aliases:
  - km-5plh
  - "@km/_orphan/5plh"
created_at: 2026-01-19T15:14:31Z
closed_at: 2026-01-19T15:26:12Z
---

# [x] O3: Visual-Aware Outline Navigation @km/_orphan #task #P3

Use character-cell positions for smarter outline mode navigation.

Current: Navigation is purely structural (prev/next sibling, parent/child)
Decker: Uses getBoundingClientRect() to find nearest item in visual direction

For TUI, could:
1. Track row positions of rendered items
2. On up/down in outline mode, find item at nearest row
3. Especially useful when items span multiple lines

Lower priority - current structural nav works, this is enhancement.