---
id: "@km/tui1/10-performance-optimization-for-large-trees"
aliases:
  - km-tui1.10
  - km-tui1-10
  - "@km/tui1/10"
created_at: 2026-01-16T23:46:53Z
closed_at: 2026-01-17T20:49:21Z
---

# [x] Performance optimization for large trees @km/tui1 #task #P2

Optimize TUI1 performance for large node trees.

## Problem

When viewing boards with many items (100+), the TUI may become sluggish due to:
- Rendering all nodes even when not visible
- Recalculating layout on every keystroke
- No virtualization of lists

## Potential Optimizations

- [ ] Virtualized list rendering (only render visible items)
- [ ] Memoization of expensive computations
- [ ] Lazy loading of child nodes
- [ ] Debounced re-renders for rapid navigation

## Measurement

Before optimizing, establish baseline:
- Time to render 100 items
- Time to render 500 items
- Memory usage patterns
- Keystroke latency

## Files

- apps/@km/tui/packages/@km/_orphan/ink/src/views/ListView.tsx
- apps/@km/tui/packages/@km/_orphan/ink/src/views/TreeNode.tsx
- apps/@km/tui/packages/@km/_orphan/ink/src/state.ts