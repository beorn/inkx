---
id: "@km/tui/tree-lenses/4-migrate-board-tsx-column-views-to-usenode-viewtree"
aliases:
  - km-tui.tree-lenses.4
  - km-tui-tree-lenses-4
  - "@km/tui/tree-lenses/4"
created_by: Bjørn Stabell
created_at: 2026-04-05T23:17:40Z
closed_at: 2026-04-06T04:21:00Z
close_reason: All 59 ctx.columns/viewIndex/viewTree refs migrated to ctx.tree (0
  remaining). CardView deleted. view-navigation.ts migrated to
  ViewTreeProjection. Column + Card use useNode for all view data.
---

# [x] Migrate Board.tsx + column views to useNode/ViewTree @km/tui #task #P2 @Bjørn Stabell

Migrate Board.tsx:
- Column list from visibleLens.children(rootId) → view.children(rootId)
- Column rendering: useNode(colId) instead of ColumnView
- Card rendering: useNode(cardId) instead of CardView
- Navigation: view.next(cursor) instead of ViewSnapshot.nextInWalk

Migrate CardColumn.tsx, ColumnsView.tsx, ListView.tsx, TabsView.tsx.

Acceptance:
- grep 'ColumnView' in views/ = 0
- grep 'CardView' in views/ = 0
- All @km/tui tests pass