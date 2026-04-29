---
id: "@km/_orphan/flexx-analysis"
aliases:
  - km-flexx-analysis
created_at: 2026-01-31T07:47:34Z
closed_at: 2026-01-31T12:23:37Z
---

# [x] Compare flexx algorithms @km/_orphan #task #P1 @claude:b8b4780b

# Flexx Algorithm Analysis - REVISED

## Benchmark Results

| Scenario | Classic | Zero | Zero Advantage |
|----------|---------|------|----------------|
| Create+Layout 50 cards | 4,074 ops/s | 6,936 ops/s | +70% |
| Layout-only 50 cards | 3,975 ops/s | 8,664 ops/s | **+118% (2.2x)** |

**Zero-alloc is significantly faster for TUI re-render case.**

## Performance Optimization Roadmap

### Already Done ✅
- Zero-alloc eliminates per-frame allocations (2x gain)
- Line boundary indices (both algorithms)
- Root-level dirty flag

### Priority 1: Reduce Passes (Low effort, Medium impact)
Combine 4 child iterations into 2:
- Pass 1: Measure all children, accumulate flex factors
- Pass 2: Distribute space + position

### Priority 2: Edge Resolution Caching (Low effort, Medium impact)
Cache resolved margin/padding/border values on style change, not per layout.
Currently resolveEdgeValue() called 20+ times per node.

### Priority 3: Constraint Fingerprinting (Medium effort, High impact)
Track `(availWidth, availHeight, direction)` per node.
Skip subtree if:
- Constraints unchanged
- Node not dirty
- Node doesn't contribute to parent sizing (not auto-sized)

Edge cases to handle:
- Shrink-wrap (auto-sized parents) - cannot skip
- Percent values - must re-resolve if parent changed
- Stretch alignment - depends on cross-axis size

### Priority 4: Two-Phase Layout (Medium effort, Medium impact)
Separate measure phase (cacheable) from position phase.
Measure results cached with constraint key.

### Future Considerations
- Typed arrays for layout values (Float32Array)
- Arena-based flat structure (high effort, marginal gain in JS)
- Lazy layout for off-screen subtrees

## Recommendation

**Zero-alloc should be primary algorithm.**

Implementation order:
1. Port RTL to Zero-alloc (or keep Classic fallback)
2. Implement edge resolution caching
3. Implement constraint fingerprinting
4. Reduce child passes