---
id: "@km/_orphan/5efp"
aliases:
  - km-5efp
created_at: 2026-01-21T22:46:16Z
closed_at: 2026-01-22T00:21:52Z
---

# [x] Duplicated getNodeAtPath/getSiblingCount in km-board @km/_orphan #task #P2

packages/@km/_orphan/board/src/board-reducer.ts reimplements functions that exist in @km/tree:
- getNodeAtPath() (lines 21-33)
- getSiblingCount() (lines 38-46)

The @km/tree versions are at packages/@km/tree/src/queries.ts lines 13-37.

IMPORTANT: The implementations differ subtly:
- @km/_orphan/board uses childCount (line 45): return parent?.childCount ?? 0
- @km/tree uses children.length (line 36): return parent?.children.length ?? 0

This could cause bugs if the implementations diverge further.

Fix: Have @km/_orphan/board import from @km/tree, or document why separate implementations are needed.