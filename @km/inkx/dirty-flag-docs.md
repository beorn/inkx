---
id: "@km/inkx/dirty-flag-docs"
aliases:
  - km-inkx.dirty-flag-docs
  - km-inkx-dirty-flag-docs
created_by: claude:dffe6eeb
created_at: 2026-02-09T13:48:08Z
closed_at: 2026-02-09T14:01:50Z
owner: bjorn@stabell.org
assignee: claude:dffe6eeb
---

# [x] content-phase: Document dirty flags on node type definition @km/inkx #task #P1 @claude:dffe6eeb

Add inline comments on the node type definition: contentDirty // node own content changed, paintDirty // style/visual property changed (color, bg), childrenDirty // direct children added/removed/reordered, subtreeDirty // deeper descendant changed. Deep research recommendation #5.