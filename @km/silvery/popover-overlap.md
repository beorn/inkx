---
mentions:
  - km
  - Bjørn
id: "@km/silvery/popover-overlap"
aliases:
  - km-silvery.popover-overlap
  - km-silvery-popover-overlap
created_by: Bjørn Stabell
created_at: 2026-04-03T07:18:45Z
closed_at: 2026-04-03T07:44:21Z
close_reason: Implemented corner cascade positioning (computeOverlapPosition).
  TL->TR->BL->BR with viewport clamping. CardColumn passes cardRect via
  PopoverRectRegistrar. 12 tests.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Popover positioning: corner-aligned overlap with cascade fallback @km/silvery #feature #P2 @Bjørn Stabell

Popovers for cards (and similar components) should overlap the target, not float beside it. Reduces visual duplication — the popover IS the expanded view of the card.

## Positioning algorithm (cascade)

Try each corner alignment in order, use the first that fits on screen:

1. Top-left aligned — popover's top-left = target's top-left (preferred: feels like expanding in-place)
2. Top-right aligned — popover's top-right = target's top-right (if popover would overflow right edge)
3. Bottom-left aligned — popover's bottom-left = target's bottom-left (if popover would overflow bottom)
4. Bottom-right aligned — popover's bottom-right = target's bottom-right (last resort)

The popover renders ON TOP of the card, covering it with the expanded content. Not beside it, not below it.

## Why overlap

A card shows: truncated title, maybe a status icon. The popover shows: full title, full body, dates, tags. If the popover floats beside the card, you see the truncated version AND the full version side by side — duplicative and wastes space. Overlapping means the popover replaces the card visually.

## Implementation

- Absolute positioning in the overlay layer
- Viewport bounds checking (cols × rows)
- Corner cascade: TL → TR → BL → BR
- Z-order: popover above all other content
- Configurable via Popover props (default: overlap, option: adjacent)

## Done when

- Popover overlaps target by default using corner cascade
- All four fallback positions work correctly
- Viewport edge detection prevents off-screen rendering

