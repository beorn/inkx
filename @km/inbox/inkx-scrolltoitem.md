---
id: "@km/inbox/inkx-scrolltoitem"
aliases:
  - km-inkx-scrolltoitem
  - "@km/_orphan/inkx-scrolltoitem"
created_at: 2026-02-02T20:42:33Z
closed_at: 2026-02-02T22:14:34Z
---

# [x] inkx VirtualList: scrollToItem ref method conflicts with prop-based scrolling @km/_orphan #bug #P2

## Problem
The scrollToItem imperative method (line 145) sets scrollOffsetRef.current = index, but this value is immediately overwritten on the next render if scrollTo prop is defined.

## Impact
Any call to scrollToItem() has no lasting effect if the component is using prop-based scrolling. The imperative API is effectively broken.

## Location
vendor/beorn-inkx/src/components/VirtualList.tsx lines 140-176

## Fix
Need to properly integrate the two APIs (ref method + prop) so they complement rather than conflict.