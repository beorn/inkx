---
id: "@km/silvery/comp-tree-view-parity"
aliases:
  - km-silvery.comp-tree-view-parity
  - km-silvery-comp-tree-view-parity
created_by: Bjørn Stabell
created_at: 2026-04-15T23:18:47Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.comp-tree-view-parity
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:18:46Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Component: TreeView parity audit vs OpenTUI/Textual @km/silvery #task #P3

blocks:: [[@km/silvery/opentui-parity]]

Audit TreeView against OpenTUI/Textual: async lazy-loading, multi-root, drag-reorder, inline rename, node icons, node badges, virtualized scrolling for deep trees.