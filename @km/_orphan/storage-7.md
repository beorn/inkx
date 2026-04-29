---
id: "@km/_orphan/storage-7"
aliases:
  - km-storage-7
created_at: 2026-01-20T10:29:58Z
closed_at: 2026-01-27T15:08:39Z
---

# [x] Flexx: Node class is 65+ methods god object @km/_orphan #task #P4 @claude:16d17ad6

## Problem
Node class has 65+ methods across 500+ lines handling:
- Tree management (insertChild, removeChild, etc.)
- Style storage (40+ setter/getter pairs)
- Layout computation
- Dirty tracking

While each method is simple, the aggregate complexity is high.

## Location
[node.ts](vendor/beorn-flexx/src/node.ts)

## Solution (Optional)
Consider composition if class grows:
- Extract `StyleContainer` for style get/set
- Extract `LayoutResult` for computed values

Note: For current terminal UI scope, this may be acceptable as-is.