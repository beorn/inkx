---
id: "@km/inbox/7nwpm"
aliases:
  - km-7nwpm
  - "@km/_orphan/7nwpm"
created_at: 2026-01-31T13:30:58Z
closed_at: 2026-01-31T13:48:04Z
---

# [x] Explore additional Zero-alloc optimizations @km/_orphan #task #P3

# Additional Optimization Research

Deep analysis confirmed constraint fingerprinting is the right approach (already implemented).

## Potential Further Optimizations

1. **Partial tree recomputation** (Medium effort, Medium impact)
   - When one node is dirty, only recompute affected subtrees
   - Complex due to flex distribution dependencies
   
2. **Style fingerprinting** (Low effort, Low impact)
   - Cache style computations across frames when styles unchanged
   - May help for large static trees
   
3. **Sibling layout reuse** (High effort, Medium impact)
   - Reuse sibling layouts when their constraints unchanged
   - Even if a different sibling changed
   - Requires tracking which siblings affect each other

4. **JIT-friendly code** (Low effort, Unknown impact)
   - Ensure monomorphic functions
   - Avoid megamorphic call sites

## Current State
- Unchanged tree: 6.1M ops/sec (faster than Yoga)
- With markDirty: ~9,500 ops/sec
- Already 1174x improvement from fingerprinting

## Recommendation
Focus on Yoga compatibility first. These are diminishing returns.