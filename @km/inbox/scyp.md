---
mentions:
  - km
id: "@km/inbox/scyp"
aliases:
  - km-scyp
  - "@km/_orphan/scyp"
created_at: 2026-01-18T22:36:04Z
closed_at: 2026-01-18T22:45:11Z
---

# [x] Refactor TUI views to use constraint system @km/_orphan #task #P2

## Summary

Refactor Board.tsx and all views (ColumnsView, ListView, TabsView) to use the existing constraint system instead of manual width/height threading.

## Current State

The constraint system exists in `src/constraints/`:

- `ConstraintRoot` - Provides terminal dimensions via context
- `useComputedSize()` - Hook to access computed dimensions
- `FlexRow` - Distributes width between columns
- `ScrollableList` - Virtualized scrolling
- `TruncatedText` - Auto-truncating text

But it's NOT being used! Views still do manual calculations:

```typescript
const termWidth = ui.dimensions.columns;
const termHeight = ui.dimensions.rows;
const maxCols = Math.min(state.columns.length, Math.max(2, Math.floor(termWidth / 35)));
// ... lots of manual math for column widths, separator widths, indicator widths
```

## Plan

### Phase 1: Board.tsx wrapper

1. Wrap the Board render in `ConstraintRoot`
2. Use `useComputedSize()` for terminal dimensions
3. Remove manual `termWidth/termHeight` calculations

### Phase 2: ColumnsView refactor

1. Use `FlexRow` for column layout
2. Use `ScrollableList` for cards within columns
3. Remove manual width distribution math

### Phase 3: ListView refactor

1. Use `ScrollableList` for the item list
2. Use `TruncatedText` for content

### Phase 4: TabsView refactor

1. Use `FlexRow` for tab headers
2. Use `ScrollableList` for tab content

## Benefits

- Eliminate manual size calculations (error-prone)
- Automatic width propagation via context
- Cleaner, more declarative view code
- Better handling of edge cases (resize, overflow)

## Files to Modify

- `src/views/Board.tsx` - Wrap in ConstraintRoot
- `src/views/ColumnsView.tsx` - Use FlexRow + ScrollableList
- `src/views/ListView.tsx` - Use ScrollableList
- `src/views/TabsView.tsx` - Use FlexRow
- `src/views/CardColumn.tsx` - Use ScrollableList (cards view)

## Related

- @km/_orphan/m9bx - Manual size calculations issue
- @km/inkz - Next-gen renderer (long-term solution)
- docs/dev/ink-patterns.md - Documented patterns

