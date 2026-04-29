---
id: "@km/tui/tree-lenses/11-delete-columnview-type-board-column-view-modes-tak"
aliases:
  - km-tui.tree-lenses.11
  - km-tui-tree-lenses-11
  - "@km/tui/tree-lenses/11"
created_by: Bjørn Stabell
created_at: 2026-04-06T06:36:06Z
closed_at: 2026-04-06T07:47:39Z
close_reason: ColumnView removed from view component props.
  Column/ColumnsView/ListView/TabsView take colId string, self-resolve via
  useNode/lens. BoardCore takes columnIds. ColumnView type moved to
  use-columns.ts internal. 2 renderBoard static tests need PaneSignals fix
  (tracked).
owner: bjorn@stabell.org
---

# [x] Delete ColumnView type — Board/Column/view modes take IDs @km/tui #task #P3

ColumnView has 62 refs across 18 files in @km/tui/src. Replace with ID-based API where components self-resolve via useNode(id). Blast radius: Board, CardColumn, ColumnsView, ListView, TabsView, shared-components, NodeView, OpCtx, board-actions-*, testing.ts, driver.ts, state.ts. Deferred from .8 as the final 5% that needs careful test verification.