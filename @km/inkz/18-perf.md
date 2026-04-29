---
id: "@km/inkz/18-perf"
aliases:
  - km-inkz.18-perf
  - km-inkz-18-perf
created_at: 2026-01-19T14:03:09Z
closed_at: 2026-01-19T15:04:19Z
---

# [x] InkZ: Performance optimization - minimize unnecessary re-rendering @km/inkz #task #P3

## Goal

Optimize InkZ rendering performance by minimizing unnecessary work at every phase of the pipeline. The goal is sub-millisecond re-renders for typical interactions (selection changes, typing).

## Performance Principles

1. **Only re-layout what changed**: Yoga supports incremental layout - don't recalculate entire tree
2. **Only re-render dirty nodes**: Track content changes at node level, skip unchanged subtrees
3. **Only output changed cells**: Diff terminal buffer, emit minimal ANSI sequences
4. **Avoid React re-renders**: Use refs and subscriptions instead of state where possible

## Current Architecture (Review)

```
React reconcile → InkzNode tree → Yoga layout → Buffer render → ANSI diff → stdout
      ↓                ↓               ↓              ↓             ↓
   O(changed)      O(tree)         O(dirty)      O(visible)    O(changed cells)
```

## Optimization Opportunities

### 1. React Layer
- [ ] **Memoize components**: Ensure Box/Text don't re-render unnecessarily
- [ ] **useLayout subscription model**: Don't trigger React re-render for layout changes, use callback
- [ ] **Batch state updates**: Coalesce rapid updates (typing, scroll) into single render

### 2. Reconciler Layer
- [ ] **Track dirty subtrees**: Only mark ancestors dirty, not entire tree
- [ ] **Skip unchanged props**: `prepareUpdate` should return null for no-op updates
- [ ] **Pool InkzNodes**: Reuse node objects instead of allocating new ones

### 3. Layout Layer (Yoga)
- [ ] **Incremental layout**: Use Yoga's dirty node tracking, don't call calculateLayout on unchanged trees
- [ ] **Cache layout results**: Store computed layout, only recalculate when dimensions change
- [ ] **Lazy propagation**: Only propagate layout to nodes that need it

### 4. Content Layer (Buffer)
- [ ] **Skip off-screen nodes**: Don't render content outside viewport (for overflow=scroll)
- [ ] **Skip unchanged nodes**: Track contentDirty flag, skip rendering unchanged subtrees
- [ ] **Clip early**: Don't process text outside visible bounds

### 5. Output Layer (ANSI)
- [ ] **Smart cursor movement**: Minimize cursor repositioning sequences
- [ ] **Coalesce style changes**: Group cells with same style into single write
- [ ] **Skip unchanged regions**: Current diffing is cell-by-cell, consider region-based

## Benchmarks to Track

| Scenario | Target | Measure |
|----------|--------|---------|
| Initial render (100 items) | <50ms | Time to first paint |
| Selection change | <5ms | Time from keypress to paint |
| Scroll (100→101) | <5ms | Time for scroll update |
| Typing character | <10ms | Time from keypress to paint |
| Resize terminal | <100ms | Time to re-layout and paint |
| 1000 item list scroll | <10ms | Virtualized scroll performance |

## Implementation Strategy

### Phase 1: Measurement
- [ ] Add performance timing instrumentation to each pipeline phase
- [ ] Create benchmark suite with realistic scenarios
- [ ] Establish baseline metrics

### Phase 2: Low-hanging fruit
- [ ] Implement dirty flag optimization (already partially done)
- [ ] Add viewport clipping for scroll containers
- [ ] Memoize Box and Text components

### Phase 3: Advanced optimizations
- [ ] Implement node pooling
- [ ] Add region-based output diffing
- [ ] Implement incremental Yoga layout

### Phase 4: Validation
- [ ] Benchmark against Ink on equivalent scenarios
- [ ] Profile memory allocation
- [ ] Test with large datasets (10k+ items)

## Acceptance Criteria

- [ ] Selection change renders in <5ms (measured)
- [ ] Scroll renders in <5ms with virtualization
- [ ] No unnecessary React re-renders (verified with React DevTools)
- [ ] No full tree re-layout on local changes
- [ ] Memory stable under repeated operations (no leaks)
- [ ] Benchmark suite exists and runs in CI

## Non-Goals (for this bead)

- GPU acceleration (terminal limitation)
- Web worker rendering (complexity vs benefit)
- Ahead-of-time compilation (premature)

## References

- React Fiber reconciler architecture
- Yoga incremental layout documentation
- Terminal emulator performance characteristics
