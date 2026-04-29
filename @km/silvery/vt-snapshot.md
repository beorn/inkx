---
id: "@km/silvery/vt-snapshot"
aliases:
  - km-silvery.vt-snapshot
  - km-silvery-vt-snapshot
created_by: Bjørn Stabell
created_at: 2026-04-02T21:08:29Z
closed_at: 2026-04-02T23:34:15Z
close_reason: Implemented. captureRegion() for ANSI snapshot. ListView cache
  stores real ANSI. Static inline mode fixed. 32 tests.
---

# [x] Snapshot capture: buffer-region grab for cache transitions @km/silvery #task #P1

Implement the snapshot capture mechanism for caching items from the React tree.

## Chosen approach: buffer-region grab

1. Output phase paints frame → runtime knows each item's screen rect (from layout)
2. When item becomes cacheable AND exits viewport (or overscan zone):
   a. Capture buffer cells in the item's rect region
   b. Convert cells to ANSI strings via cellsToAnsi (already exists)
   c. Store in ListCache as { rows: string[], plainTextRows: string[], width: number }
3. Unmount item from React tree — ListCache now owns it

## Why not render-to-string?

- Silvery doesn't have render-to-string (and shouldn't need one)
- Buffer-region grab captures the REAL rendered output including:
  - Border characters and box-drawing
  - Padding and margin spacing
  - Overlapping styles from parent containers
  - Theme-resolved colors (not $tokens, actual ANSI)
- It's what the user actually SAW, not a re-interpretation

## Resize handling

When terminal width changes:
- VirtualCache: mark all cached items as stale (width != current width)
- On scroll-into-view of stale item: re-mount in React, capture at new width, re-cache
- If over capacity: evict stale items first (oldest)
- TerminalCache: ED3 clears scrollback, re-emit all at new width (existing behavior)

## Edge cases

- Item height changes between cache and display (content wraps differently at new width)
- Item cached while partially visible (only capture fully-exited items)
- Rapid scroll through many items (batch captures, don't block render loop)
- Items with animations or timers (freeze animation state before capture)

## Dependencies

- Needs layout rect tracking per ListView item (already exists via MeasuredItem)
- Needs buffer read access in output phase (expose via runtime API)
- Needs cellsToAnsi for the rect region (already exists, may need rect-clipping variant)