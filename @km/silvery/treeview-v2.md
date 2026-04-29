---
id: "@km/silvery/treeview-v2"
aliases:
  - km-silvery.treeview-v2
  - km-silvery-treeview-v2
created_by: Bjørn Stabell
created_at: 2026-04-02T21:59:39Z
closed_at: 2026-04-03T01:16:14Z
close_reason: Implemented. TreeView delegates to ListView. Flattening + indent +
  expand/collapse. 11 tests pass. Commit 8684652.
---

# [x] TreeView as ListView composition @km/silvery #task #P2

Rewrite TreeView as ListView + flatten tree + indent + expand/collapse nav. Gets cache/search for free.