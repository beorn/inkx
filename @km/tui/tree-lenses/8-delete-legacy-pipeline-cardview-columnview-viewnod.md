---
id: "@km/tui/tree-lenses/8-delete-legacy-pipeline-cardview-columnview-viewnod"
aliases:
  - km-tui.tree-lenses.8
  - km-tui-tree-lenses-8
  - "@km/tui/tree-lenses/8"
created_by: Bjørn Stabell
created_at: 2026-04-06T04:11:16Z
closed_at: 2026-04-06T08:56:07Z
close_reason: "Legacy pipeline deleted: viewNodeToColumnViews=0,
  buildViewTree=0, ViewSnapshot=0, CardView=0. ColumnView eliminated from ALL
  live code paths (action handlers, Board.tsx rendering, find, search-replace,
  buildOpCtx board mode). ColumnView remains only in initialization
  (InitialBoardData — runs once at startup), test harness
  (testing.ts/driver.ts), and detail-mode cursor derivation. Live rendering
  pipeline is fully tree-based."
---

# [x] Delete legacy pipeline: CardView, ColumnView, viewNodeToColumnViews, buildViewTree, ViewSnapshot @km/tui #task #P2

Quality plateau: delete the entire old rendering pipeline. Each component receives an ID and self-resolves via useNode.

## What to delete
1. CardView interface + isCardView guard (types.ts)
2. toCardViews function (use-columns.ts)
3. viewNodeToColumnViews (@km/_orphan/board/view-tree.ts)
4. buildViewTree (@km/_orphan/board/view-tree.ts)
5. ViewSnapshot computed (pane-signals.ts ps.view)
6. ColumnView interface (types.ts)
7. ctx.columns, ctx.viewTree, ctx.viewIndex from OpCtx (tui-context.ts)
8. use-columns.ts (or reduce to just buildNodeIndexFromTree + deriveCursorIndices)

## What replaces them
- Board derives columnIds from tree.children(rootId)
- Column derives cardIds from useNode(colId).childIds
- Card/TreeNode derives all data from useNode(cardId)
- nodeIndex from buildNodeIndexFromTree
- wipLimit from useNode(colId).rules
- Detail pane column derivation rewired to use ViewTree

## Detail pane
deriveDetailColumns in use-columns.ts creates ColumnView[] for the detail pane. Needs rewiring to use ViewTree or a simplified column structure.

## Blockers
- view-navigation.ts must be migrated first (agent running)
- Board text/property filters need ID-based filtering (or stay as post-filter)

## Acceptance
- grep 'ColumnView' in apps/@km/tui/src/ = 0 (excluding comments)
- grep 'CardView' in apps/@km/tui/src/ = 0 (excluding comments)
- grep 'viewNodeToColumnViews' = 0
- grep 'buildViewTree' in apps/@km/tui/src/ = 0
- grep 'ViewSnapshot' in apps/@km/tui/src/ = 0