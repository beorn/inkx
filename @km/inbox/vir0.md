---
id: "@km/inbox/vir0"
aliases:
  - km-vir0
  - "@km/_orphan/vir0"
created_at: 2026-01-19T10:51:04Z
closed_at: 2026-01-19T11:05:49Z
---

# [x] Remove unused individual command exports from @km/commands @km/_orphan #task #P3

Files export both individual commands (cursorPrev, cursorNext) and arrays (navigationCommands). Only arrays are re-exported from package root. 40+ individual exports are dead code that bloats the public API.