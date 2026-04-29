---
id: "@km/_orphan/g6qd"
aliases:
  - km-g6qd
created_at: 2026-01-16T12:12:59Z
closed_at: 2026-01-16T12:20:10Z
---

# [x] Layer violation: km-shared imports from @km/store @km/_orphan #bug #P1

tree.ts in @km/_orphan/shared directly imports getChildren and getNode from @km/store. This violates layering - @km/_orphan/shared should be a pure utilities package with no runtime dependencies on the store layer.

Locations:
- getNodeDisplayName() calls getChildren() at line 63
- getCollapsedTypeSuffix() calls getChildren() at line 166  
- getParentContext() calls getNode() at lines 274, 288, 293

Fix: Refactor these functions to accept node data as parameters instead of calling store directly.