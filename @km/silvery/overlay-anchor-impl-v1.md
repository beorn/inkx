---
id: "@km/silvery/overlay-anchor-impl-v1"
aliases:
  - km-silvery.overlay-anchor-impl-v1
  - km-silvery-overlay-anchor-impl-v1
created_by: claude:2405c72e
created_at: 2026-04-25T21:23:13Z
closed_at: 2026-04-26T06:38:17Z
close_reason: "Shipped: 11ea66c9 + 0dd0dd70 + 9c63d627 + 640cb27a + 13dcbf89 +
  e64c2381 (silvery) — 72 tests across BoxProps additions, placeFloating 12
  placements, findAnchor, decoration rects, OverlayLayer, STRICT=2 fixture.
  Session: km-session.0425-evening"
---

# [x] Implement overlay/anchor system v1 — anchorRef + decorations + OverlayLayer @km/silvery #task #P2 @claude:2405c72e

blocks:: [[@km/silvery/overlay-anchor-system]]

Implementation of the overlay/anchor system designed in hub/silvery/design/overlay-anchor-system.md. Adds:

- BoxProps.anchorRef (semantic input)
- BoxProps.decorations: readonly Decoration[] (semantic input)
- LayoutSignals.anchorRect + decorationRects (geometric output peers of cursorRect/selectionFragments)
- findAnchor(root, id, edge?) tree-walk lookup
- placeFloating(anchor, target, placement) — pure rect-math, unit-tested
- OverlayLayer per-frame artifact bundling caret/focus/selection/decorations/anchors

Caret / focus / selection retain dedicated BoxProps for ergonomics + back-compat. Everything else (popover, tooltip, hover-indicator, highlight, drag-overlay, custom) routes through Decoration[].

## Acceptance

See § 10 of hub/silvery/design/overlay-anchor-system.md. Key points:

1. New BoxProps fields have contract tests (per vendor/silvery/CLAUDE.md 'New Props Require Tests').
2. SILVERY_STRICT=2 fixture: one anchor + one popover renders at expected rect, incremental == fresh.
3. OverlayLayer.{caret,focus,selection} matches existing per-signal reads (cross-check property test).
4. Zero new layout-output lint violations.
5. All 12 placements covered in placeFloating unit tests.

## Out of scope (explicit)

- Collision-aware flipping (v2)
- Popover transitions / portals / a11y
- Generic Decoration kind extension hook
- App-level z-index for decorations (fixed paint order)

## Defer until

- A real @km/tui or silvercode popover use-case requests the substrate.
- OR: Phase 4 cleanup needs the unified OverlayLayer for cross-target work.

## References

- Design doc: hub/silvery/design/overlay-anchor-system.md
- Parent bead: @km/silvery/overlay-anchor-system
- /pro reviews: /tmp/llm-2405c72e-...-5zsn.txt § 6 + ...-yvaz.txt § A