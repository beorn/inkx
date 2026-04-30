---
id: "@km/inbox/inkx-render-purity"
aliases:
  - km-inkx-render-purity
  - "@km/_orphan/inkx-render-purity"
created_at: 2026-02-02T20:42:45Z
closed_at: 2026-02-02T22:14:33Z
---

# [x] inkx VirtualList: ref mutation during render violates React purity @km/_orphan #bug #P2

## Problem
The component directly mutates scrollOffsetRef during render (line 172), which violates React's purity requirements.

if (scrollTo !== undefined) {
    const newScrollOffset = calcEdgeBasedScrollOffset(...);
    scrollOffsetRef.current = newScrollOffset;  // Impure mutation during render!
}

## Impact
- Mutation doesn't trigger re-renders (refs don't cause updates)
- In concurrent mode, mutation persists across renders unpredictably
- Makes debugging harder

## Location
vendor/beorn-inkx/src/components/VirtualList.tsx lines 163-176

## Fix
Use state for values that should trigger re-renders, refs only for stable identity/imperative handles.