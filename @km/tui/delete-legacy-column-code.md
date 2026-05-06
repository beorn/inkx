---
mentions:
  - km
  - Bjørn
id: "@km/tui/delete-legacy-column-code"
aliases:
  - km-tui.delete-legacy-column-code
  - km-tui-delete-legacy-column-code
created_by: Bjørn Stabell
created_at: 2026-04-06T10:27:54Z
closed_at: 2026-04-07T05:56:48Z
close_reason: "Merged via 2483ebe7e (squash of worktree-agent-a85f3d65 —
  5bc342954+c4c2409b5+06612767e). Removed
  buildBoardState/initBoardState/createEmptyState/BoardStateResult from state.ts
  (~321 lines), createBoardState/createSimpleTestBoard/etc fixture DSL (~477
  lines), inlined deriveColumnsFromLens. Acceptance greps PASS. 29/29 board.test
  + helper tests pass. Deferred: deriveColumnsFromRepo (web/km-canvas + 10 test
  files use it) and ColumnView type — broader tree-lens migration follow-up."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Delete remaining ColumnView/buildBoardState legacy code @km/tui #task #P0 @Bjørn Stabell

Continue cleanup from the tree-lenses quality plateau session.

## What to delete

1. buildBoardState, initBoardState, buildBoardStateGenerator, createEmptyState from state.ts (~250 lines)
2. Dead fixture functions in board-fixtures.ts (createBoardState, createSimpleTestBoard, createStatusTestBoard — 0 importers)
3. deriveColumnsFromRepo + deriveColumnsFromLens from use-columns.ts (only used by dead test fixtures + profile-startup)
4. ColumnView type from use-columns.ts (after all consumers gone)
5. BoardStateResult type from state.ts (after buildBoardState gone)

## What to keep

- deriveDetailColumns (used by Board.tsx + board-app.ts for detail mode — deferred to @km/tui/detail-spatial-nav)
- buildNodeIndexFromTree, deriveCursorIndices (live code)
- createColumnView, createCardNode in board-fixtures.ts (used by board-test.ts renderBoard/board DSL)
- profile-startup.ts buildBoardState call (benchmarking — can keep or replace)

## Acceptance

- grep buildBoardState apps/@km/tui/src/ = 0
- grep initBoardState apps/@km/tui/src/ = 0
- grep ColumnView apps/@km/tui/src/ → only use-columns.ts (deriveDetailColumns) + board-app.ts (detail mode)
- All tests pass

