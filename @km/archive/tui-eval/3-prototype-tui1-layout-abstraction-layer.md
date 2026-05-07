---
mentions:
  - km
id: "@km/tui-eval/3-prototype-tui1-layout-abstraction-layer"
aliases:
  - km-tui-eval.3
  - km-tui-eval-3
  - "@km/tui-eval/3"
created_at: 2026-01-16T23:53:05Z
closed_at: 2026-01-17T00:02:24Z
---

# [x] Prototype TUI1 layout abstraction layer @km/tui-eval #task #P3

## Summary

If TUI1 layout pain points are addressable, prototype a thin abstraction layer to reduce boilerplate.

## Goals

1. Reduce manual width tracking boilerplate
2. Centralize display length calculations
3. Simplify text truncation patterns
4. Make component code more declarative

## Possible Approaches

1. **Layout context** - React context that provides width down the tree
2. **Constraint components** - `<Constrain width={n}>` wrapper that handles truncation
3. **useLayout hook** - Custom hook that calculates available width
4. **Layout primitives** - Higher-level components like `<TruncatedText>`, `<FlexRow>`

## Acceptance Criteria

- [ ] Prototype one approach in a branch
- [ ] Apply to TreeNode as test case
- [ ] Compare code complexity before/after
- [ ] Document trade-offs

## Depends On

- @km/tui-eval/1-analyze-tui1-layout-pain-points (TUI1 analysis) - need to understand pain points first

