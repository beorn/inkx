---
id: "@km/_orphan/flexx-perf"
aliases:
  - km-flexx-perf
created_at: 2026-01-30T17:51:13Z
closed_at: 2026-01-30T21:20:18Z
---

# [x] Flexx layout performance optimization @km/_orphan #epic #P1 @claude:b8b4780b

## Goal
Make Flexx layout performance comparable to Yoga for the km TUI.

## Current State (after layout caching fix)
- Flexx is ~2.6x slower than Yoga (500 nodes, 5.8ms vs 2.2ms)
- Measure caching: 44% hit rate
- Layout caching: Reduces O(n²) to O(n log n) for deep trees

## Child Tasks
### Performance (P1-P2)
- @km/_orphan/flexture-measure-phase: Separate measure from layout phase
- @km/_orphan/flexture-measure-cache-expand: Expand measure cache beyond 4 entries
- @km/_orphan/flexture-alloc-hot: Eliminate allocations in hot paths

### Correctness (P2-P3, not blocking perf)
- @km/_orphan/flexture-colrev: Fix column-reverse
- @km/_orphan/flexture-wraprev: Fix wrap-reverse
- @km/_orphan/flexture-abs-auto-margin: Fix auto margin centering
- @km/_orphan/flexture-pct-nested: Fix nested percentage resolution
- @km/_orphan/flexture-aligncontent: Implement alignContent for wrapped layouts

## Verification
Run quick-compare.ts benchmark after each change to measure impact.