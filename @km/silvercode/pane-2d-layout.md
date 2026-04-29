---
id: "@km/silvercode/pane-2d-layout"
aliases:
  - km-silvercode.pane-2d-layout
  - km-silvercode-pane-2d-layout
created_by: claude:2405c72e
created_at: 2026-04-25T07:45:45Z
closed_at: 2026-04-25T15:25:55Z
close_reason: Implemented in 250eb5fd9. Tree-based 2D layout
  (LayoutNode/LayoutSplit) with row+column splits. New ops
  splitLeaf/removeLeaf/setSplitWeight/leafIds/reconcileTree. Ctrl+W s for
  horizontal split. Direction-aware PaneDivider. 3 new tests pass; 15/15
  pane-related visual tests green.
---

# [x] 2D pane layout (binary-split tree, horizontal splits, Ctrl+W s) @km/silvercode #feature #P3 @claude:2405c72e

blocks:: [[@km/silvercode]]

Replace the 1D row-of-panes layout with a binary-split tree so users can split horizontally as well as vertically. Wires Ctrl+W s (horizontal split below) and lets the user nest splits arbitrarily (vsplit a pane that's itself a hsplit). Persistence schema in apps/silvercode/src/pane-layout.ts grows from a flat `weights[]` array to a tree node — bump version to 2. Deferred from @km/silvercode/pane-management v1: v1 ships the 1D row only, sufficient for the typical 2-3 pane workflow.