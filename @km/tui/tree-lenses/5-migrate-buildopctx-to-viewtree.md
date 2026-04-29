---
id: "@km/tui/tree-lenses/5-migrate-buildopctx-to-viewtree"
aliases:
  - km-tui.tree-lenses.5
  - km-tui-tree-lenses-5
  - "@km/tui/tree-lenses/5"
created_by: Bjørn Stabell
created_at: 2026-04-05T23:17:40Z
closed_at: 2026-04-06T00:55:22Z
close_reason: "tree required in OpCtx, 23/59 refs migrated to ctx.tree (34 new
  usages). 36 remain: 29 ctx.columns (grid-model), 7 ctx.viewIndex. Merged 6
  agent commits."
owner: bjorn@stabell.org
---

# [x] Migrate buildOpCtx to ViewTree @km/tui #task #P2

buildOpCtx currently reads ViewSnapshot for viewTree/viewIndex/columns.
Migrate to read from pane.signals.tree (ViewTree):
- viewTree → view (the ViewTree itself)
- viewIndex → view.node(id) 
- columns → view.children(rootId)
- nodeIndex → derived from view.children

Slim OpCtx: remove viewTree, viewIndex, columns fields.
Replace with a single tree: ViewTree reference.

Acceptance:
- OpCtx.viewTree/viewIndex/columns removed
- OpCtx has tree: ViewTree
- All action handler tests pass