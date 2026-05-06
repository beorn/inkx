---
mentions:
  - km
  - Bjørn
id: "@km/tui/tree/v4/detail-unify"
aliases:
  - km-tui.tree.v4.detail-unify
  - km-tui-tree-v4-detail-unify
created_by: Bjørn Stabell
created_at: 2026-04-09T06:18:50Z
closed_at: 2026-04-09T07:32:19Z
close_reason: "Gap 1: useEffects 21→10 (exceeded ≤12 target). Gap 2:
  DerivedColumn 0 refs. Gap 3: zebra fixed. Board.tsx 1422→1336 LOC. LOC target
  ≤1100 not met — would require Board split (future). ColumnSnapshot kept as
  legitimate DTO."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Quality plateau gaps — Board.tsx useEffects, DerivedColumn deletion, detail view unification @km/tui #task #P2 @Bjørn Stabell

## Why

Systematic audit of @km/tui/tree + @km/tui/tree/v4 found 3 gaps where phases were closed aspirationally.

## Gap 1: Phase 9 — Board.tsx still 1356 LOC / 21 useEffects

Bead said ≤12 useEffects, ≤1000 LOC. Reality: store API added (good), prev-tracking refs deleted (good), but effects are still there as thin wrappers. Signal writes need to move from Board.tsx useEffects to action handlers.

What to do: move cursor/selection/edit signal writes from Board.tsx useEffect calls to board-actions.ts. Board.tsx effects that call store.setCursor() etc should be deleted — action handler writes signals at mutation time. Target: ≤12 useEffects, ≤1100 LOC.

## Gap 2: Phase 10 — DerivedColumn renamed, not deleted (28 refs)

Bead said delete ColumnView. Agent renamed to DerivedColumn and closed. 28 references across 7 files.

Root cause: detail view uses deriveDetailColumns() returning DerivedColumn[] with virtual __body__ KNode objects. Also @km/canvas/tsx and test fixtures.

What to do: unify detail view as board viewMode (same lens, same tree, same signals). Delete DerivedColumn, deriveDetailColumns, createVirtualBodyNode, __body__ virtual nodes. Migrate @km/canvas/tsx and test fixtures.

## Gap 3: Zebra pattern bug (visual)

Card bg tint when cursor is on sub-item doesn't propagate uniformly to all rows. Termless repro in progress. Likely silvery findInheritedBg issue.

## /complete

rg 'useEffect' apps/@km/tui/src/views/Board.tsx | wc -l  # ≤12
wc -l apps/@km/tui/src/views/Board.tsx  # ≤1100
rg 'DerivedColumn' --glob '!.beads' --glob '!docs' -t ts -c | wc -l  # 0
rg 'deriveDetailColumns|__body__' --glob '!.beads' -t ts -c | wc -l  # 0
bun vitest run apps/@km/tui/tests/card-bg-inheritance.test.ts  # pass (uniform bg)

