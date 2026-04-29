---
id: "@km/_orphan/mlv9"
aliases:
  - km-mlv9
created_at: 2026-01-19T15:53:19Z
closed_at: 2026-01-19T15:53:28Z
---

# [x] InkX: Fix overflow=hidden clipping in pipeline.ts @km/_orphan #task #P2

## Problem
Content from containers with `overflow='hidden'` was bleeding outside their bounds, causing visual corruption (e.g., kanban column content bleeding into HelpBar area).

## Root Cause
The rendering pipeline wasn't enforcing clip bounds when `overflow='hidden'` was set on a container. Yoga's `OVERFLOW_HIDDEN` only affects layout calculations, not the actual rendering.

## Fix Applied
1. Added clip bounds calculation and propagation in `renderNodeToBuffer`
2. Child clip bounds are intersected with parent clip bounds
3. `renderBox` now skips rendering and clips background fill when outside bounds
4. `renderBorder` uses `isRowVisible()` helper to respect clip bounds
5. `renderText` skips lines outside clip bounds

## Files Changed
- `vendor/beorn-inkx/src/pipeline.ts` - Added clip bounds handling
- `vendor/beorn-inkx/examples/kanban/index.tsx` - Added `overflow="hidden"` to columns container

## Status
Fix implemented and verified working for initial render.