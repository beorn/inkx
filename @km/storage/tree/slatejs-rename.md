---
mentions:
  - km
  - Bjørn
---

# [x] Rename tree operations to SlateJS vocabulary — split, mergeBackward, insertNode, etc. @km/storage/tree #task #P2 @Bjørn Stabell

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

