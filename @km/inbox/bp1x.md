---
id: "@km/_orphan/bp1x"
aliases:
  - km-bp1x
created_at: 2026-01-16T23:47:51Z
closed_at: 2026-01-16T23:52:26Z
---

# [x] Prototype TUI1 layout abstraction layer @km/_orphan #task #P3

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

- @km/_orphan/zrbr (TUI1 analysis) - need to understand pain points first