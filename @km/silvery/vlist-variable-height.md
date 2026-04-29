---
id: "@km/silvery/vlist-variable-height"
aliases:
  - km-silvery.vlist-variable-height
  - km-silvery-vlist-variable-height
created_by: claude:f8196c1c
created_at: 2026-03-28T15:35:54Z
closed_at: 2026-03-29T02:44:42Z
close_reason: VirtualList now measures actual rendered heights via onLayout
  callbacks. MeasuredItem wraps each item, reports height to useVirtualizer
  cache. Falls back to estimateHeight for unmeasured items. 7 new tests. All 5
  km consumers auto-benefit. Docs updated.
owner: bjorn@stabell.org
---

# [x] VirtualList: variable item height via measurement — eliminate fixed itemHeight @km/silvery #feature #P2

## Problem
VirtualList uses a fixed itemHeight estimate for scroll calculations. Cards have variable heights (3-6 rows depending on title length, children, body content). Every adjustment to the constant fixes one case but breaks another — the constant has been changed 5+ times across sessions.

## Solution
Support variable item heights by measuring actual rendered height. Two approaches:
1. **Measure-then-layout**: Render offscreen, measure heights, then position. Works for silvery's synchronous render pipeline.
2. **Dynamic measurement**: Use useContentRect callbacks to track actual heights per item. Update virtualizer state when measurements change.

## Connection to km
CardColumn (apps/@km/tui/src/views/CardColumn.tsx) uses ScrollTrackingVirtualList with itemHeight=4 and overscan=5 as a band-aid. With variable heights, these workarounds can be removed.

## Prior art
- react-virtuoso, @tanstack/virtual use dynamic measurement
- silvery already has useContentRect for element size tracking