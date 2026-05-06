---
aliases:
  - km-silvery.scrollbar-controlled-view
  - km-silvery-scrollbar-controlled-view
created_at: 2026-05-06T00:23:07.307Z
_stub: true
---

related:: [[@km/silvery/scroll-interaction-l4-l5]]

## Problem

`Scrollbar` currently owns a mix of view geometry, drag mapping, hover state,
and callback metadata. The latest bug shows the key invariant:

> pointer mapping may use grab geometry, but thumb rendering must always use
> current scroll geometry.

When geometry changes while dragging, the pointer can drift above/below the
thumb. The viewport is correct, but the visual affordance lies.

### Acceptance Criteria

- [ ] While dragging, the pointer remains at the same relative thumb position
      even when `scrollableRows` or thumb size changes.
- [ ] Thumb paint is always derived from current `scrollOffset`,
      `scrollableRows`, and `trackHeight`.
- [ ] Drag mapping preserves the grabbed thumb fraction, not a stale absolute
      row offset.
- [ ] Track clicks, wheel-driven updates, hidden-idle hover reveal, and
      outside-terminal release all keep current behavior.
- [ ] Tests cover geometry growth and shrink during an active drag.
- [ ] This can later collapse into `ScrollController` without changing the
      visual semantics.

Implemented current-scroll-geometry thumb rendering and active-drag grab-fraction preservation. Evidence: SILVERY_STRICT=1 bun vitest run --project vendor vendor/silvery/tests/features/scrollbar-component.test.tsx (14 passed); focused Storybook/ListView scroll suites passed; vendor/silvery typecheck passed.

