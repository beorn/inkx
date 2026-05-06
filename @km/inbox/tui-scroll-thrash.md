---
mentions:
  - km
id: "@km/inbox/tui-scroll-thrash"
aliases:
  - km-tui-scroll-thrash
  - "@km/_orphan/tui-scroll-thrash"
created_at: 2026-02-02T20:43:01Z
closed_at: 2026-02-02T21:52:08Z
---

# [x] ColumnsView: VirtualList scroll thrashing between columns @km/_orphan #bug #P1

## Problem

When navigating between columns:

1. Old column gets scrollTo=undefined
2. New column gets scrollTo=newCardIndex
3. The VirtualList receiving scrollTo=undefined may reset its scroll position

Both columns' VirtualLists exist simultaneously and may both try to manage scroll position, causing thrashing.

## Impact

When navigating left/right between columns, the current column's scroll position may jump unexpectedly.

## Location

apps/@km/tui/src/views/ColumnsView.tsx lines 177-182

## Related

This is likely the root cause of the column scroll bug being investigated.

