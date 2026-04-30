---
id: "@km/inbox/tui-card-rerender"
aliases:
  - km-tui-card-rerender
  - "@km/_orphan/tui-card-rerender"
created_at: 2026-02-02T20:43:01Z
closed_at: 2026-02-02T22:14:40Z
---

# [x] ColumnsView: All cards re-render on cursor movement @km/_orphan #bug #P2

## Problem
The renderCard callback has dependencies that cause all cards to re-render on any cursor movement:

[colIndex, isSelected, selectedCardIndex, selectedSubIndex, selectionLevel, inOutlineMode]

When ANY of these change (e.g., moving to a different column), the callback is recreated, forcing VirtualList to re-render all visible cards in ALL columns.

## Impact
Poor performance during navigation - pressing 'h' or 'l' causes all visible cards to re-render.

## Location
apps/@km/tui/src/views/ColumnsView.tsx line 128

## Fix
Split the callback or use more granular memoization so only affected cards re-render.