---
id: "@km/_orphan/flexx-parity"
aliases:
  - km-flexx-parity
created_at: 2026-01-31T07:47:43Z
closed_at: 2026-01-31T09:01:29Z
---

# [x] Achieve flexx algorithm parity @km/_orphan #task #P2 @claude:b8b4780b

# Flexx Algorithm Parity → Classic Optimization

**Goal:** Optimize Classic algorithm for deep nesting performance.

## Context (P1 Analysis Result)

Classic is the primary algorithm. Zero-alloc is experimental/deprecated.
Focus optimization efforts on Classic only.

## Key Optimizations

### 1. Line Boundary Indices (@km/_orphan/flexture-line-boundary)
Eliminate O(N×L) scanning by storing line start/end indices.

### 2. Dirty-flag Incremental Layout (@km/_orphan/flexture-dirty-flag)
Skip unchanged subtrees during layout recalculation.

## Optional Future Optimizations
- Measure result caching
- Single-child special case
- Iterative traversal (replace recursion)

## Success Criteria
- Deep nesting benchmarks (50+ levels) complete in reasonable time
- No regression in flat layout performance
- All 33 Yoga tests still pass