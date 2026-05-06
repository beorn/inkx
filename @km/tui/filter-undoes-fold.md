---
mentions:
  - km
  - Bjørn
id: "@km/tui/filter-undoes-fold"
aliases:
  - km-tui.filter-undoes-fold
  - km-tui-filter-undoes-fold
created_by: Bjørn Stabell
created_at: 2026-04-06T20:03:01Z
closed_at: 2026-04-06T20:38:01Z
close_reason: "Cannot reproduce: wrote 4 tests covering the exact repro (fold +
  filter dialog + toggle done value), all pass without code changes. The bead's
  hypothesized cause ('view lens recomputation calls
  computeDefaultFoldDepths()') is not present in the code —
  computeDefaultFoldDepths is only called at store init (which preserves
  existing depths) and at ZOOM_IN/SET_ROOT (which deliberately reset on root
  change). Filter actions never call it. The prescribed fix ('only compute
  defaults when foldDepths is empty') is already implemented in
  computeDefaultFoldDepths at apps/km-tui/src/state/board-app-store.ts:1617.
  Regression tests added to apps/km-tui/tests/filter.slow.test.ts lock in the
  expected behavior. If symptom recurs, please attach exact step-by-step repro."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] [bug] Filter toggle silently undoes fold state @km/tui #bug #P2 @Bjørn Stabell

Repro: Fold a card with H → open filter (V) → toggle done. The fold is silently undone. Root cause: view lens recomputation calls computeDefaultFoldDepths() which resets manual fold state.

