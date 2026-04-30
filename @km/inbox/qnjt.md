---
id: "@km/inbox/qnjt"
aliases:
  - km-qnjt
  - "@km/_orphan/qnjt"
created_at: 2026-01-24T16:38:48Z
closed_at: 2026-01-24T19:51:43Z
---

# [x] h/l visual navigation goes to first card instead of same Y position @km/_orphan #bug #P1

## Fixed in @km/_orphan/qnjt-fix (commit 0cc43d1)

Changed fallback behavior when target column has no registered positions:
- OLD: Use same card index (e.g., card 3 → card 3), which could be 75% down a shorter column
- NEW: Use proportional index (e.g., 50% → 50%), maintaining visual position

## Remaining potential improvements

The proportional fallback is approximate. For perfect visual navigation:
1. Pre-render all columns to get positions (expensive)
2. Or calculate positions from card content heights (requires content measurement)

The proportional approach is a reasonable compromise that works well for typical boards with similar card heights.

## Root cause confirmed

When columns scroll out of view, their Card components unmount and positions are never re-registered. Only visible columns have positions registered.