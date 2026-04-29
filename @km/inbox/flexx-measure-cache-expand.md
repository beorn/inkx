---
id: "@km/_orphan/flexx-measure-cache-expand"
aliases:
  - km-flexx-measure-cache-expand
created_at: 2026-01-30T17:49:28Z
closed_at: 2026-01-30T18:11:40Z
---

# [x] [flexx] Expand measure cache beyond 4 entries @km/_orphan #task #P2

## Summary
Current 4-entry LRU cache gets thrashed when nodes are measured with multiple constraint combinations (common in flex).

## Options
1. Increase to 8-16 entries (still cheap)
2. Use fixed-size direct-mapped cache with hash key
3. Split caches: measure-only vs final-layout

## Common Constraint Patterns to Optimize
- (NaN, undefined) - unconstrained
- (exact_width, undefined) - width-constrained
- (max_width, AT_MOST) - shrink-to-fit

## Metrics to Track
- Cache hit rate before/after
- Number of actual measure calls per node per pass