---
id: "@km/_orphan/yy1y"
aliases:
  - km-yy1y
created_at: 2026-01-19T15:26:46Z
closed_at: 2026-01-20T07:38:35Z
---

# [x] Simplify nodeMap API (YAGNI - three ways to do same thing) @km/_orphan #task #P3

**Problem:** nodeMap.ts exports three ways to do the same thing:
- `createNodeMap()` - creates fresh map
- `CachedNodeMap` class - caches by reference
- `getNodeById()` global - uses global cache

This violates YAGNI. Pick one pattern.

**Recommendation:** Keep `createNodeMap()` for explicit control and remove global cache. Let consumers manage caching via useMemo or explicit cache instances.

**Low priority** - the APIs work, this is cleanup.