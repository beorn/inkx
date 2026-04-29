---
id: "@km/_orphan/fwemm"
aliases:
  - km-fwemm
created_at: 2026-02-02T21:20:05Z
closed_at: 2026-02-02T21:30:15Z
---

# [x] Code review: VirtualList/ColumnsView scroll implementation improvements @km/_orphan #task #P2 @claude:1588825b

Code review of inkx VirtualList and @km/tui scroll implementation revealed several issues and improvement opportunities:

## Issues Found

### 1. Duplicate scroll logic pattern across views
- CardColumn.tsx (line 327-332) and ColumnsView.tsx (line 197-203) have identical scrollTo conditional logic
- Both do: `isSelected && selectedCardIndex >= 0 && selectedCardIndex < column.cards.length ? selectedCardIndex : undefined`
- Should be extracted to shared utility or component pattern

### 2. Inconsistent debug logging
- VirtualList.tsx uses `debug` package (requires DEBUG env var)
- ColumnsView.tsx uses `createConditionalLogger` (requires LOG_LEVEL=debug)
- CardColumn.tsx uses `layoutLog` from log.ts
- Makes debugging difficult when different env vars are needed

### 3. Magic numbers in virtualization constants
- OVERSCAN values differ: 20 in ColumnsView, 15 in CardColumn
- MAX_RENDERED values differ: 100 vs 50
- SCROLL_PADDING=2 in VirtualList is undocumented
- Should be configurable or at least documented why they differ

### 4. VirtualList scroll state complexity
- Uses both state (scrollState) and props (scrollTo) for scroll tracking
- Effect at line 175-194 has subtle "freeze" behavior when scrollTo is undefined
- Comments explain it but the dual-source-of-truth is error-prone

### 5. Edge-based scroll calculation could be simplified
- calcEdgeBasedScrollOffset has SCROLL_PADDING logic that's hard to follow
- The math at line 108 (`selectedIndex - visibleCount + SCROLL_PADDING + 1`) is non-obvious

### 6. renderCard callback dependency array includes boolean expressions
- ColumnsView.tsx line 141-148: `isSelected && selectedCardIndex` in deps
- This is unusual pattern that could cause subtle bugs

## Potential Refactoring

1. Create `useVirtualScroll` hook to encapsulate scroll logic
2. Standardize debug logging to use one approach
3. Document or unify virtualization constants
4. Consider moving scroll-to-selected logic into VirtualList itself
5. Add tests specifically for scroll behavior edge cases