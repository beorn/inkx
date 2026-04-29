---
id: "@km/_orphan/d5im"
aliases:
  - km-d5im
created_at: 2026-01-20T07:43:48Z
closed_at: 2026-01-20T07:51:25Z
---

# [x] Consolidate task status mark mapping @km/_orphan #task #P3

## Problem
Task status → mark mapping is duplicated:
- apps/@km/_orphan/cli/src/commands/tasks.ts:350-362 (getMarkForStatus)
- packages/@km/storage/src/store.ts:308-319 (in writeTaskStatusToFile)

## Solution
Centralize in @km/core or @km/storage and export for CLI use.