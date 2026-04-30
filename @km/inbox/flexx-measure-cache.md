---
id: "@km/inbox/flexx-measure-cache"
aliases:
  - km-flexx-measure-cache
  - "@km/_orphan/flexx-measure-cache"
created_at: 2026-01-30T17:17:05Z
closed_at: 2026-01-30T17:50:58Z
---

# [x] Validate Flexx measure caching fix @km/_orphan #task #P1

Implemented 4-entry numeric cache for measure functions in Flexx Node class to reduce redundant measure calls (was 294k calls for 1629 nodes = 181 calls/node).

Changes made:
- Added MeasureEntry type in types.ts
- Added _m0/_m1/_m2/_m3 cache entries in Node class
- Added cachedMeasure() method with 4-entry LRU cache
- Updated markDirty() to clear cache
- Updated calculateLayout() to reset/log stats
- Updated layout.ts to use cachedMeasure() instead of measureFunc

Still needed:
- Test with real TUI (ttyd) to verify perf improvement
- Run full benchmark suite to compare before/after
- Verify cache hit rate in production scenario