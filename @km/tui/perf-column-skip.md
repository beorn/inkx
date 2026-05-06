---
mentions:
  - km
  - claude
id: "@km/tui/perf-column-skip"
aliases:
  - km-tui.perf-column-skip
  - km-tui-perf-column-skip
created_at: 2026-02-08T21:30:24Z
closed_at: 2026-02-09T00:15:23Z
assignee: claude:a3625ec3
---

# [x] Prevent Column re-render on within-column cursor movement @km/tui #task #P1 @claude:a3625ec3

## Prevent Column re-render on within-column cursor movement

## Problem

When j/k moves cursor between cards within the same column, Column re-renders because
`useIsCursorInColumn(colIndex)` returns a new object whenever `cardIndex` changes.
This cascades: Column → VirtualList → ~50 renderItem calls → ~50 Card memo comparisons.

Only 2 Cards actually differ (old/new cursor), costing ~3ms. The other ~20ms is wasted
on Column + VirtualList re-renders.

## Current: 24ms for j/k

- Column re-render (~8-12ms): useIsCursorInColumn returns new object
- VirtualList renderItem loop (~8-10ms): 50 renderItem calls
- 2 Card re-renders (~2-3ms): actual work
- Ink toTerminal (~2-3ms): buffer diff

## Target: <5ms for j/k (common case)

## Solution

1. Split `useIsCursorInColumn` into:
- `useIsColumnSelected(colIndex)` → { isSelected, selectionLevel } — stable on j/k
- `useCursorCardIndex(colIndex)` → number — for scroll tracking only
5. Column subscribes to `useIsColumnSelected` only — doesn't re-render on j/k
6. Add `ColumnScrollTracker` (null-rendering component) that:
- Subscribes to `useCursorCardIndex`
- Calls `virtualListRef.scrollToItem()` imperatively
- Only causes VirtualList re-render when scroll offset actually changes
12. Card uses `useIsCursorAtCard` exclusively (remove prop dependency)

## Expected: Common case (cursor in window) = ~3ms

- Column: no re-render ✓
- VirtualList: no re-render (scroll offset unchanged) ✓
- 2 Cards: re-render via CursorStore (~3ms) ✓

