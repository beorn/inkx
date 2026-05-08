---
aliases:
  - km-silvery.selection-focus-plateau.render-plan-selection-parity
  - km-silvery-selection-focus-plateau-render-plan-selection-parity
created_at: 2026-05-08T15:28:18.924Z
closed_at: 2026-05-08T16:59:42.592Z
closeReason: "RenderSink/PlanSink now persist selectable metadata per cell
  patch; render-plan production test asserts direct/replay selectable parity.
  Tests: vendor render-plan-production, render-plan-parity,
  selection-cell-semantics, selection suite."
---

# [x] L5: render-plan and direct render selection parity matrix #P1

Lock the invariant that direct rendering, render-plan replay, and sectioned replay produce identical selectable-cell metadata.

Acceptance criteria:

- Add or extend tests that render the same fixtures through direct render, render-plan replay, and sectioned replay.
- Cover semantic text, structural blanks, blank lines between blocks/cards, ANSI spans, wrapped/truncated text, nested userSelect modes, scroll containers, sticky/absolute content where supported.
- Assert selectable flags and copied text, not only visual appearance.
- The historical bug class fails without the fix: layout blanks become selectable, or text cells lose selectable metadata after replay.

