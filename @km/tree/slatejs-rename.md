---
id: "@km/tree/slatejs-rename"
aliases:
  - km-tree.slatejs-rename
  - km-tree-slatejs-rename
created_by: Bjørn Stabell
created_at: 2026-04-03T03:34:12Z
closed_at: 2026-04-03T03:54:11Z
close_reason: "Shipped a08e115e. All 8 renames done: split, mergeBackward,
  mergeForward, KNode.string, KNode.setString, KTree.previous, KTree.next,
  degrade."
---

# [x] Rename tree operations to SlateJS vocabulary — split, mergeBackward, insertNode, etc. @km/tree #task #P2 @Bjørn Stabell

Rename tree operations to SlateJS vocabulary where it's better.

KEEP (already good):
  updateNode, deleteNode, addNode, moveNode, getNode, getChildren

RENAME:
  splitNode → split
  mergeWithPrevious → mergeBackward
  mergeWithNext → mergeForward
  getEditableText → KNode.string()
  setEditableText → KNode.setString()
  getPreviousSibling → KTree.previous()
  getNextSibling → KTree.next()
  backspaceDegradation → degrade

Use /refactor migrate for the mechanical rename.