---
id: "@km/_orphan/qtnly"
aliases:
  - km-qtnly
created_by: claude:65d845d9
created_at: 2026-03-13T02:26:48Z
closed_at: 2026-03-13T02:36:42Z
close_reason: "Fixed: clearDirtyFlags(node) called before returning for
  hidden/display:none nodes"
---

# [x] Hidden/display:none nodes leave stale dirty flags @km/_orphan #bug #P1

renderNodeToBuffer returns early for hidden/display:none nodes without clearing dirty flags. Stale subtreeDirty blocks markSubtreeDirty propagation. Fix: clearDirtyFlags(node) before returning.