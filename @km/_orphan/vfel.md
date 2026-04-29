---
id: "@km/_orphan/vfel"
aliases:
  - km-vfel
created_at: 2026-01-20T07:44:23Z
closed_at: 2026-01-20T20:48:17Z
---

# [x] Split db-queries.ts (669 lines) @km/_orphan #task #P4

## Problem
packages/@km/storage/src/db-queries.ts is 669 lines with 7 query categories.

## Recommended Split
- db-queries-nodes.ts - core node queries (lines 19-176)
- db-queries-tree.ts - tree navigation (lines 323-400)
- db-queries-tasks.ts - task-specific (lines 406-462)
- db-queries-search.ts - FTS and search (lines 467-591)
- Keep utilities and rowToNode in main file

## Note
resolveNode() (lines 198-307) has 7 resolution strategies in 110 lines - consider strategy pattern.