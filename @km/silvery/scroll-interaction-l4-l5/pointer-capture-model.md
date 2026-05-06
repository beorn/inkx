---
aliases:
  - km-silvery.pointer-capture-model
  - km-silvery-pointer-capture-model
created_at: 2026-05-06T00:23:03.877Z
_stub: true
---

# Pointer capture model for Silvery mouse events #task #P1

related:: [[@km/silvery/scroll-interaction-l4-l5]]
blocks:: [[@km/silvery/scroll-interaction-l4-l5/scroll-controller-scrollarea]] [[@km/silvery/scroll-interaction-l4-l5/scrollbar-controlled-view]]

## Problem

Silvery has `mouseCapture` today, but capture behavior is partly encoded in
terminal event dispatch and partly assumed by components. Recent scrollbar
work had to special-case `hitTest(root, x, y) === null` to keep drag/up events
flowing and clear hover chrome when the pointer leaves the terminal.

That is not an L4 primitive: it is hard to reason about multiple pointers,
cancel/outside semantics, hover suspension during capture, or future DOM/canvas
targets.

## Acceptance Criteria

- [ ] Define pointer capture semantics for Silvery mouse/pointer events:
      down, move, up, cancel, wheel, enter, leave, outside/root-exit.
- [ ] Capture target receives move/up/cancel even when hit testing returns no
      target or a different target.
- [ ] Hover enter/leave behavior is deterministic while captured and after
      release.
- [ ] Public event API remains compatible with fractional `event.x`/`event.y`
      layout coordinates and optional physical `clientX`/`clientY`.
- [ ] Tests cover capture inside target, outside target, outside terminal, and
      release/cancel cleanup.
- [ ] Scrollbar no longer needs bespoke no-target drag code beyond using the
      public capture API.

Partial foundation already landed in mouse dispatch: captured move/up is delivered even when hitTest returns null and hoverPath clears outside terminal. Remaining before close: formal pointer capture API/semantics, cancel/outside events, and broader tests.

related:: [[@km/silvery/scroll-interaction-l4-l5]]
blocks:: [[@km/silvery/scroll-interaction-l4-l5/scroll-controller-scrollarea]] [[@km/silvery/scroll-interaction-l4-l5/scrollbar-controlled-view]]
