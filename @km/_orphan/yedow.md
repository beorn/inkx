---
id: "@km/_orphan/yedow"
aliases:
  - km-yedow
created_by: claude:8f007ba9
created_at: 2026-02-19T23:57:09Z
closed_at: 2026-02-20T00:26:00Z
---

# [x] Eliminate ColumnState/CardState/ColumnsLayout — complete migration @km/_orphan #task #P1

## ColumnState/CardState/ColumnsLayout Elimination — COMPLETE

All 6 phases completed:

### Phase 1: ColumnView type ✅
- Added ColumnView to types.ts (node, cardNodes, virtualCardIds, wipLimit?, rules?, isVirtual?)
- deriveColumnsFromRepo returns ColumnView[]
- buildNodeIndex accepts ColumnView[] with optional getChildren for descendant mapping
- deriveCursorIndices replaces deriveCursorPosition

### Phase 2: Flat ActionCtx ✅
- ctx.layout.X → ctx.X (columns, colIndex, cardIndex, isAtCardLevel, nodeIndex)
- ctx.column: ColumnView | undefined (was ColumnState)
- ctx.card: KNode | undefined (was CardState)

### Phase 3: React components ✅
- Board.tsx: flat props (colIndex, cardIndex, isAtCardLevel) — no BoardLayout wrapper
- CardColumn, ColumnsView, ListView, TabsView, shared-components: all updated
- TreeNode: receives KNode directly

### Phase 4: refreshBoardState deleted ✅
- Replaced with direct ctx.dispatchBoard({ type: 'SELECT', nodeId })
- moveCardUpDown: cursor follows via cursorNodeId
- moveCardToColumn: cursor follows first moved card

### Phase 5: Types purged ✅
- Deleted: ColumnState, CardState, ColumnsLayout, COLUMN_HEADER_INDEX
- Deleted: use-cursor-position.ts (absorbed into use-columns.ts)
- Deleted: mapDescendants → restored with repo-based getChildren
- Zero grep matches for any deleted types

### Phase 6: Tests pass ✅
- 204 test files, 1732+ tests all passing
- Fixture functions renamed: createCardNode, createColumnView
- Test helpers updated: state.layout → flat fields

### Key fix during migration
buildNodeIndex descendant mapping was accidentally removed. Restored with repo.getChildren() callback — essential for cursor resolution after indent/outdent.