---
mentions:
  - km
  - claude
id: "@km/tui/visual-nav-migration"
aliases:
  - km-tui.visual-nav-migration
  - km-tui-visual-nav-migration
created_by: claude:36393b5d
created_at: 2026-02-18T23:43:37Z
closed_at: 2026-02-20T07:37:05Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Visual navigation migration: eliminate colIndex/cardIndex, simplify store @km/tui #task #P2 @claude:8f007ba9

## Visual Navigation Migration: Eliminate ColumnState/CardState/ColumnsLayout

## Goal

Delete ALL view-model wrapper types. Components work with KNode directly. No backwards compat, no bridge functions.

## Types to DELETE

- ColumnState (types.ts) → replaced by ColumnView { node, cardNodes, virtualCardIds, wipLimit?, rules?, isVirtual? }
- CardState (types.ts) → replaced by plain KNode, children via repo.getChildren()
- ColumnsLayout (types.ts) → flat fields on ActionCtx
- COLUMN_HEADER_INDEX (types.ts) → literal -1
- CursorPosition (use-cursor-position.ts) → inlined into use-columns.ts
- deriveCursorPosition() → deriveCursorIndices() in use-columns.ts
- refreshBoardState() → direct dispatchBoard SELECT by nodeId
- usePositionHints → not needed

## Phases (DO NOT SKIP OR REORDER)

1. Create ColumnView type, update deriveColumnsFromRepo to return it, move deriveCursorPosition into use-columns.ts, DELETE use-cursor-position.ts
2. Flatten ActionCtx (layout → flat fields), DELETE ColumnsLayout, fix ALL ctx.layout.X → ctx.X across all action files
3. Update React components: Board, CardColumn, ColumnsView, ListView, TabsView, shared-components, TreeNode — cards are KNode not CardState
4. Delete refreshBoardState + usePositionHints, replace callers with direct SELECT by nodeId
5. Delete ColumnState, CardState from types.ts, update state.ts/testing.ts/driver.ts
6. Update test fixtures and test files

## Anti-Deviation Rules

1. NO bridge/adapter functions — delete old type, fix ALL breaks
2. NO gradual/partial migration — each phase completes fully
3. NO "phase N deferred" — finish everything
4. NO @deprecated — delete, don't deprecate
5. Use tsc errors as guide after each deletion

## Mechanical Patterns

- card.node.X → card.X (one indirection removed)
- card.children → repo.getChildren(card.id)
- card.childCount → repo.getChildren(card.id).length
- card.isVirtual → column.virtualCardIds.has(card.id)
- col.cards → col.cardNodes
- ctx.layout.X → ctx.X
- ColumnState → ColumnView
- CardState → KNode

## Scope

~23 source files, ~7 test files, ~200 reference sites. Most changes are mechanical substitutions.

