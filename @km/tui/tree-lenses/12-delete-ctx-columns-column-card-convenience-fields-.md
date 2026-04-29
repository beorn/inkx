---
id: "@km/tui/tree-lenses/12-delete-ctx-columns-column-card-convenience-fields-"
aliases:
  - km-tui.tree-lenses.12
  - km-tui-tree-lenses-12
  - "@km/tui/tree-lenses/12"
created_by: Bjørn Stabell
created_at: 2026-04-06T07:32:19Z
closed_at: 2026-04-06T08:43:10Z
close_reason: OpCtx.columns and OpCtx.column (ColumnView) removed. Replaced with
  OpCtx.columnId (string). ~20 call sites migrated across 8 files. ColumnView
  still used internally in buildOpCtx for cursor derivation but not exposed on
  OpCtx interface. All 1555 tests pass.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Delete ctx.columns/column/card convenience fields from OpCtx @km/tui #task #P3 @Bjørn Stabell

After .11 eliminates ColumnView from view components, the OpCtx still has ctx.columns (ColumnView[]), ctx.column (ColumnView | undefined), and ctx.card (KNode | undefined) as convenience fields. These duplicate what ctx.tree can compute on demand.

Migrate call sites:
- ctx.column.node → ctx.tree.node(currentColumnId)
- ctx.column.cardNodes → ctx.tree.children(currentColumnId).map(id => ctx.tree.node(id))
- ctx.card → ctx.tree.node(ctx.cursor) or walk ancestors
- ctx.columns → ctx.tree.children(ctx.rootId)

After this, buildOpCtx's column derivation step disappears entirely. deriveColumnsFromLens may still be needed for detail pane (which has different column model via deriveDetailColumns).

Depends on .11.