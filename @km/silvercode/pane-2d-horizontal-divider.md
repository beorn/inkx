---
id: "@km/silvercode/pane-2d-horizontal-divider"
aliases:
  - km-silvercode.pane-2d-horizontal-divider
  - km-silvercode-pane-2d-horizontal-divider
created_by: claude:cc081a9a
created_at: 2026-04-28T15:07:38Z
closed_at: 2026-04-28T17:06:37Z
close_reason: "Divider rendering bug fixed: silvery 639cc7fa (regression test) +
  c739c790 (canonicalize PaneDivider pattern with minWidth/minHeight=0 CSS
  auto-min escape hatch) + km 31de5c9c9 (production fix in PaneGrid.tsx). Root
  cause was NOT a reconciler/dirty-flag bug — it was Text wrap=wrap
  auto-min-size pinning to longest-unbreakable-token width. Verified: silvery
  divider-overflow-clear.test.tsx 4/4 passing. The pane-2d-layout.test.tsx tests
  still fail but the cause is orthogonal (split-direction routing) — filed as
  km-silvercode.split-direction-race."
---

# [x] Visual regression: horizontal pane dividers render as vertical (─ → │) after paint-clear merges @km/silvercode #bug #P1

blocks:: [[@km/silvercode]]

Visual test apps/silvercode/tests/visual/pane-2d-layout.test.tsx fails on 3 tests after merging feat/paint-clear-invariant + feat/paint-clear-l5-step5-outline-snapshots. Output contains only │ chars, no ─. Likely caused by silvery paint-clear gate or RenderPostState changes. Repro: bun vitest run apps/silvercode/tests/visual/pane-2d-layout.test.tsx. Failing tests: 'Ctrl+G s — horizontal split', 'Ctrl+G v then Ctrl+G s — mixed', 'Ctrl+G z — zoom hides dividers'.