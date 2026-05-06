---
aliases:
  - km-silvery.scroll-interaction-l4-l5
  - km-silvery-scroll-interaction-l4-l5
created_at: 2026-05-06T00:23:02.206Z
---

# Scroll interaction L4/L5 architecture #epic #P1

tracks:: [[@km/silvery/scroll-interaction-l4-l5/pointer-capture-model]] [[@km/silvery/scroll-interaction-l4-l5/scroll-controller-scrollarea]] [[@km/silvery/scroll-interaction-l4-l5/scrollbar-controlled-view]] [[@km/silvery/scroll-interaction-l4-l5/storybook-previewhost-scrollarea]] [[@km/silvery/scroll-interaction-l4-l5/scroll-interaction-l5-tests]]

## Problem

Silvery scrolling currently works through several adjacent mechanisms:
`useKineticScroll`, `Box overflow="scroll"`, `ListView` row-space scrolling,
standalone `Scrollbar`, Storybook-specific measurement, and mouse capture
logic in the terminal event dispatcher.

That creates recurring L2/L3 bugs:

- the viewport can be at bottom while the scrollbar thumb visually stops
  around 3/4 down;
- the pointer/thumb grab position can drift while dragging because the
  content or max-scroll geometry changes under the drag;
- hidden scrollbar tracks stay mounted to preserve hover hit testing;
- Storybook has to manually measure preview content and unwrap top-level
  `Screen` stories;
- no single state owner can assert `offset`, `max`, `viewport`, and `content`
  invariants.

## Target

Move scroll interaction to L4/L5:

- L4: invalid states become hard or impossible because pointer capture,
  scroll state, drag mapping, and scroll chrome each have one owner.
- L5: old workaround paths are deleted and focused regressions/property tests
  cover pointer capture, geometry changes during drag, viewport resizing,
  Storybook preview scrolling, and ListView follow/end interactions.

## Design Direction

- Pointer capture becomes a Silvery input primitive, not a one-off scrollbar
  escape path.
- `ScrollController`/`ScrollArea` own scroll state:
  `{ offset, max, viewportSize, contentSize, isDragging, isScrolling }`.
- `Scrollbar` becomes a controlled view over that scroll state. It maps
  pointer position to offset and renders the thumb from current state every
  frame.
- Hit areas and paint should be separable: interactive track geometry should
  not require visible thumb pixels to stay mounted.
- Storybook preview should use the same `ScrollArea` primitive as apps, with a
  `PreviewHost` that handles top-level `Screen` stories.

## Acceptance Criteria

- [ ] No visual thumb drift: while dragging, the pointer remains at the same
      relative position inside the thumb even if `max` or thumb size changes.
- [ ] The scrollbar thumb always renders from current `offset`/`max` geometry,
      never stale drag geometry.
- [ ] Pointer capture dispatches move/up/cancel outside the hit-tested target
      and outside the terminal viewport.
- [ ] Scroll state has a single canonical owner for generic scroll surfaces.
- [ ] Storybook preview scrolling uses the canonical scroll surface.
- [ ] Old Storybook measurement glue and scrollbar-specific mouse workarounds
      are deleted or reduced to compatibility adapters.
- [ ] L5 tests cover current regressions and geometry-changing drag cases.

tracks:: [[@km/silvery/scroll-interaction-l4-l5/pointer-capture-model]] [[@km/silvery/scroll-interaction-l4-l5/scroll-controller-scrollarea]] [[@km/silvery/scroll-interaction-l4-l5/scrollbar-controlled-view]] [[@km/silvery/scroll-interaction-l4-l5/storybook-previewhost-scrollarea]] [[@km/silvery/scroll-interaction-l4-l5/scroll-interaction-l5-tests]]

