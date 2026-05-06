---
mentions:
  - km
id: "@km/inbox/y5pq"
aliases:
  - km-y5pq
  - "@km/_orphan/y5pq"
created_at: 2026-01-20T07:44:07Z
closed_at: 2026-01-20T07:46:16Z
---

# [x] Refactor tasks.ts (1108 lines) @km/_orphan #task #P3

## Problem

apps/@km/_orphan/cli/src/commands/tasks.ts is 1108 lines with 12+ distinct concerns.

## Recommended Split

- commands/task/format.ts - formatting functions (lines 39-146)
- commands/task/query.ts - filtering, path matching (lines 417-490)
- commands/task/crud.ts - add, delete, update operations (lines 748-892)
- commands/task/display.ts - list, show functions (lines 511-706)
- Keep main command definitions in task.ts

## Related

Also addresses layer violation (@km/_orphan/0avt) by moving db access to storage API.

