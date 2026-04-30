---
id: "@km/inbox/flexx-alloc-hot"
aliases:
  - km-flexx-alloc-hot
  - "@km/_orphan/flexx-alloc-hot"
created_at: 2026-01-30T17:49:19Z
closed_at: 2026-01-30T20:34:10Z
---

# [x] [flexx] Eliminate allocations in hot paths @km/_orphan #task #P2

## Summary
Per-pass allocations cause GC pressure and deopt JS engines.

## Hot Path Allocations to Eliminate

### 1. ChildLayout[] array (layout.ts ~615)
- Created fresh each layout pass
- Solution: Store scratch fields on nodes (tmpMainSize, tmpCrossSize, etc.) or reuse capacity-managed array

### 2. resolveEdgeValue creates objects
- Returns {value, unit} objects
- Solution: Return resolved number directly, use sentinel for undefined

### 3. Measure result objects
- cachedMeasure returns {width, height}
- Solution: Write into preallocated output object or store on node

## Implementation Priority
1. ChildLayout[] (biggest allocation)
2. resolveEdgeValue (called many times per node)
3. Measure results (already partially cached)