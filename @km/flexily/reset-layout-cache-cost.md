---
id: "@km/flexily/reset-layout-cache-cost"
aliases:
  - km-flexily.reset-layout-cache-cost
  - km-flexily-reset-layout-cache-cost
created_by: claude:c9beade3
created_at: 2026-03-13T05:26:28Z
closed_at: 2026-03-13T05:38:05Z
close_reason: "Investigated. resetLayoutCache() invalidates per-pass layout
  cache (_lc0, _lc1) before each calculateLayout. Could be replaced with a
  generation counter (cache entries store generation, hit check compares against
  current generation), eliminating the walk entirely. However: the walk is O(n)
  with trivial per-node work (~1 conditional + 1 field write per cache entry),
  while layout itself is O(n) with heavy computation. Adds <5% overhead. The
  generation counter approach requires modifying the cache hit logic in
  node-zero.ts (hot path) and adding a module-level mutable counter, which risks
  introducing caching bugs in an area where 3 bugs have already been found. Low
  benefit, meaningful risk. Deferring."
---

# [x] Perf: resetLayoutCache() is full-tree walk every pass — may be redundant @km/flexily #task #P2
