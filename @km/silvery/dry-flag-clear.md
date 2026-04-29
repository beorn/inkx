---
id: "@km/silvery/dry-flag-clear"
aliases:
  - km-silvery.dry-flag-clear
  - km-silvery-dry-flag-clear
created_by: claude:c9beade3
created_at: 2026-03-13T04:30:45Z
closed_at: 2026-03-13T05:21:26Z
close_reason: "Fixed: extracted clearNodeDirtyFlags() helper, replaced inline
  6-line clearing at line 647 and deduplicated
  clearDirtyFlags/clearVirtualTextFlags."
owner: bjorn@stabell.org
---

# [x] DRY: Extract shared dirty flag clearing helper @km/silvery #task #P2

Dirty flag clearing logic (contentDirty, paintDirty, bgDirty, subtreeDirty, childrenDirty, layoutChangedThisFrame) duplicated in 3 places: renderNodeToBuffer tail, clearDirtyFlags(), clearVirtualTextFlags(). Extract clearNodeFlags() helper. Found by GPT pipeline review.