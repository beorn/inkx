---
id: "@km/tui/tree-lenses/6-delete-legacy-old-viewnode-columnview-cardview-bui"
aliases:
  - km-tui.tree-lenses.6
  - km-tui-tree-lenses-6
  - "@km/tui/tree-lenses/6"
created_by: Bjørn Stabell
created_at: 2026-04-05T23:17:41Z
closed_at: 2026-04-06T04:21:12Z
close_reason: Superseded by .8 which has more detailed scope. CardView already deleted.
---

# [x] Delete legacy: old ViewNode, ColumnView, CardView, buildViewTree, ViewSnapshot @km/tui #task #P2

Final cleanup after all consumers migrated:
- Delete old ViewNode interface from view-tree.ts
- Delete ColumnView/CardView from types.ts
- Delete buildViewTree, buildViewIndex, viewNodeToColumnViews
- Delete ViewSnapshot (replaced by ViewTree)
- Delete createViewSnapshot
- Delete viewNodeToColumnViews
- Delete useColumns hook (if still exists)
- Remove old exports from @km/_orphan/board barrel

Acceptance:
- grep 'buildViewTree' in src/ = 0 (except view-lens.ts internal)
- grep 'ColumnView' in src/ = 0
- grep 'CardView' in src/ = 0
- grep 'ViewSnapshot' in src/ = 0
- All tests pass