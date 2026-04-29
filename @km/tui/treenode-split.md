---
id: "@km/tui/treenode-split"
aliases:
  - km-tui.treenode-split
  - km-tui-treenode-split
created_by: claude:23485adf
created_at: 2026-02-23T17:09:35Z
closed_at: 2026-03-04T00:57:49Z
---

# [x] Phase 7: split TreeNode into Display + Edit components @km/tui #task #P3 @claude:f47d1ff0

TreeNodeImpl has 30 hooks, 8 editing-only. Split into DisplayTreeNode (22 hooks) + EditableTreeNode (+8 hooks), mounted only for the ONE node being edited. Reduces per-node overhead for non-editing nodes.