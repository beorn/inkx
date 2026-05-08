---
aliases:
  - km-silvery.selection-focus-plateau.test-cell-selectability-api
  - km-silvery-selection-focus-plateau-test-cell-selectability-api
created_at: 2026-05-08T15:28:46.280Z
closed_at: 2026-05-08T16:59:42.644Z
closeReason: "Added @silvery/test cell-inspector helpers for
  char/style/selectable maps and updated selection/render-plan tests to use
  stable helper APIs. Tests: vendor selection/render-plan group and vendor tsc."
---

# [x] L5: expose clean test APIs for cell selectability #P3

Make tests assert selectable-cell state through stable, typed helpers instead of private buffer spelunking or ad hoc termless cell duck-typing.

Acceptance criteria:

- Add or standardize a helper that returns a cell map including grapheme, fg/bg, inverse/restyle state, and selectable state.
- Update selection/render-plan regression tests to use the helper.
- Remove avoidable casts and duck-typed checks around inverse/selectable cell attributes.
- Keep low-level tests allowed to inspect internals only where the test is explicitly for that internal module.
- Document the helper enough that future selection bugs get tested at the right level.

