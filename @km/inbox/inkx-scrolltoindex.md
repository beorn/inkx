---
mentions:
  - km
id: "@km/inbox/inkx-scrolltoindex"
aliases:
  - km-inkx-scrolltoindex
  - "@km/_orphan/inkx-scrolltoindex"
created_at: 2026-02-02T20:42:45Z
closed_at: 2026-02-02T22:14:32Z
---

# [x] inkx VirtualList: scrollToIndex calculation produces wrong child index @km/_orphan #bug #P2

## Problem

The scrollToIndex calculation can become negative when clampedIndex < startIndex:

const selectedIndexInSlice = clampedIndex - startIndex;
const scrollToIndex = hasTopPlaceholder ? selectedIndexInSlice + 1 : selectedIndexInSlice;

If selectedIndexInSlice is negative, Math.max(0, scrollToIndex) clamps it to 0, scrolling to the top placeholder instead of the intended item.

## Location

vendor/beorn-inkx/src/components/VirtualList.tsx lines 233-246

