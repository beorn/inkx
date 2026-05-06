---
aliases:
  - km-silvery.scroll-controller-scrollarea
  - km-silvery-scroll-controller-scrollarea
created_at: 2026-05-06T00:23:05.554Z
_stub: true
---

related:: [[@km/silvery/scroll-interaction-l4-l5]]
blocked_by:: [[@km/silvery/scroll-interaction-l4-l5/pointer-capture-model]]

## Problem

Generic scroll state is duplicated across `useKineticScroll`, `Box
overflow="scroll"`, `ListView`, `Scrollbar`, and Storybook preview glue. No
single model can clamp offsets when content/viewport changes, expose the same
state to scrollbars and content, or make drag/follow/kinetic causes explicit.

### Acceptance Criteria

- [ ] Add a canonical controller/model for generic scroll surfaces:
      `offset`, `max`, `contentSize`, `viewportSize`, `isScrolling`,
      `isDragging`, and cause metadata.
- [ ] Add `ScrollArea` or equivalent composition primitive that wires content,
      wheel/kinetic state, and scrollbar chrome through one controller.
- [ ] `Scrollbar` can consume the controller or a controlled state shape.
- [ ] `ListView` can either use the controller directly or adapt its row-space
      model to the same interface.
- [ ] Offset clamps when content size or viewport size changes.
- [ ] Tests cover resize/content-growth/content-shrink while scrolled and
      while dragging.

Implemented first primitive: ScrollArea + useScrollController own contentHeight, viewportHeight, maxScroll, scrollOffset, wheel handler, and scrollbar wiring for plain scroll panes. Remaining before close: formal cause metadata, richer controller API, and ListView adapter/unification.
