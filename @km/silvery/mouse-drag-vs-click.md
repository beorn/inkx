---
id: "@km/silvery/mouse-drag-vs-click"
aliases:
  - km-silvery.mouse-drag-vs-click
  - km-silvery-mouse-drag-vs-click
created_by: claude:c6244087
created_at: 2026-04-23T07:34:41Z
closed_at: 2026-04-23T07:58:45Z
close_reason: Fixed in silvery 915b4bf9 + km bump 4216d4c5d. Bugs 2
  (mouseUp→onSelect) and 3 (1-char selection on plain click) fixed via
  armed→dragging state machine. Bug 1 (drag-shrink) NOT reproducible at silvery
  layer — 7 regression tests added as lock-in. Ergonomic
  term.mouse.*/term.clipboard API landed alongside in
  vendor/silvery/packages/test/src/index.tsx.
---

# [x] Mouse drag selection: shrink broken + mouseUp fires onClick/onSelect @km/silvery #bug #P1

blocks:: [[@km/silvery]]

Discovered while exercising @km/logview text selection (just enabled via silvery 6c4442ee selection-default fix).

## Bug 1 — selection grows but doesn't shrink
User drags down: selection grows (anchor stays, head moves forward). ✓
User drags back up past start: selection does NOT shrink. ✗
Expected: head follows cursor regardless of direction; passing back through anchor flips anchor↔head.

## Bug 2 — mouseUp triggers click → detail view
User completes a drag-select and releases: ListView's onClick fires (because the Box wrapping each row has both onMouseEnter and onClick). With @km/logview's onSelect=handleSelect, this opens the detail overlay, hiding everything except the highlighted text. Screenshot: only selected text visible on black.

## Root cause (hypothesized)
Headless selection.ts state machine is clean (extend correctly assigns head = current pos regardless of direction). So:
- Bug 1: the mouse event dispatcher isn't firing 'extend' actions on all move events during drag — or coordinate mapping drops reverse deltas
- Bug 2: ListView's onClick is unconditional on mouseUp. Missing 'suppress click when selection drag just completed' logic.

## Acceptance criteria
1. Drag-select shrinks when mouse reverses direction (termless test: simulate down→move→up moving back to start → selection range.head matches start position).
2. mouseUp that completes a drag selection does NOT fire ListView onClick/onSelect (termless test: simulate drag, assert onSelect was not called).
3. A plain click (no move) still fires onClick/onSelect (regression test).
4. State machine sketch (in file header comment) covering: idle → drag-starting (mouseDown) → dragging (mouseMove) → drag-ending (mouseUp). Only drag-ending paths that moved suppress click.

## Files likely touched
- vendor/silvery/packages/ag-term/src/features/selection.ts (SelectionFeature dispatcher)
- vendor/silvery/packages/ag-react/src/ui/components/ListView.tsx (suppress click after drag)
- vendor/silvery/tests/features/selection-integration.test.ts (add shrink test)
- vendor/silvery/tests/features/with-dom-events-selection.test.ts (add drag-then-click test)

Reference: headless state machine at vendor/silvery/packages/headless/src/selection.ts:275-289