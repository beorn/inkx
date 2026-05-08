---
aliases:
  - km-silvery.selection-focus-plateau.property-selection-fixtures
  - km-silvery-selection-focus-plateau-property-selection-fixtures
created_at: 2026-05-08T15:28:31.748Z
closed_at: 2026-05-08T16:59:42.617Z
closeReason: "Added table-driven selectable-cell semantic fixture with
  inspectable cell maps covering text, structural blanks, userSelect none, wide
  graphemes, and trailing structural cells. Tests: selection-cell-semantics plus
  selection suite."
---

# [x] L5: property tests for selection cell semantics #P2

Add property-style or table-driven fixture tests that make selectable-cell semantics difficult to regress.

Acceptance criteria:

- Generate or enumerate trees with mixed Text, Box, blanks, wrapped content, disabled selection subtrees, nested selection scopes, wide graphemes, and ANSI fragments.
- Assert invariants independent of paint order: structural cells are never selectable, disabled subtrees never copy, text-origin cells remain selectable through reflow, and copied text is clean semantic text.
- Exercise viewport changes: resize, scroll, clipping, reveal, and sectioned replay where applicable.
- Keep failures inspectable with named fixtures or printed cell maps so future fixes do not devolve into visual guessing.

