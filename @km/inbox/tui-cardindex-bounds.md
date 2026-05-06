---
mentions:
  - km
id: "@km/inbox/tui-cardindex-bounds"
aliases:
  - km-tui-cardindex-bounds
  - "@km/_orphan/tui-cardindex-bounds"
created_at: 2026-02-02T20:43:01Z
closed_at: 2026-02-02T22:14:40Z
---

# [x] ColumnsView: Missing bounds check for selectedCardIndex @km/_orphan #bug #P2

## Problem

VirtualList receives scrollTo={isSelected ? selectedCardIndex : undefined} without validating that selectedCardIndex is within column.cards.length bounds.

If selectedCardIndex is out of bounds, VirtualList will attempt to render or scroll to an undefined item.

## Location

apps/@km/tui/src/views/ColumnsView.tsx lines 177-182
apps/@km/tui/src/hooks/use-cursor-position.ts lines 93-95

