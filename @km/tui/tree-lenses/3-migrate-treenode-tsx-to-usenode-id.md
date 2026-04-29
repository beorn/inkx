---
id: "@km/tui/tree-lenses/3-migrate-treenode-tsx-to-usenode-id"
aliases:
  - km-tui.tree-lenses.3
  - km-tui-tree-lenses-3
  - "@km/tui/tree-lenses/3"
created_by: Bjørn Stabell
created_at: 2026-04-05T23:17:39Z
closed_at: 2026-04-06T00:55:06Z
close_reason: "TreeNode now uses useNode(id) for: embed resolution
  (display/isSymlink/isBrokenSymlink), hasBody, children (viewNode.childIds).
  resolveEmbed kept for FoldedChildRow fallback. Memo simplification deferred to
  .4 (needs node prop removal)."
---

# [x] Migrate TreeNode.tsx to useNode(id) @km/tui #task #P2 @Bjørn Stabell

The biggest consumer. TreeNode currently reads:
- node/role/isBody/resolvedEmbed from ViewNode (old type)
- children from props or repo
- selected/hovered/edit from ReactiveNodeStore

Migrate to:
- useNode(id) for viewType/childIds/parentId/display/isBody/rules
- Keep ReactiveNodeStore for selected/hovered/edit (interactive state)

~24 TreeNode references to isBody, ~10 to resolvedEmbed, ~20 to role.
All become node.isBody, node.display, node.viewType.

Acceptance:
- grep 'ViewNode' in TreeNode.tsx = 0 (only ViewNode from new type)
- All @km/tui tests pass