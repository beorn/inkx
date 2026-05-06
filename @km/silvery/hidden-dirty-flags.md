---
mentions:
  - km
id: "@km/silvery/hidden-dirty-flags"
aliases:
  - km-silvery.hidden-dirty-flags
  - km-silvery-hidden-dirty-flags
created_by: claude:c9beade3
created_at: 2026-03-13T04:28:34Z
closed_at: 2026-03-13T04:51:08Z
close_reason: "Fixed in 895190a. theme-stack-leak: try/finally around
  pushContextTheme/popContextTheme in content-phase.ts. hidden-dirty-flags:
  clearDirtyFlags() called on early return for hidden and display:none nodes."
owner: bjorn@stabell.org
---

# [x] Hidden/display:none nodes leak stale dirty flags — blocks future propagation @km/silvery #bug #P1

Early returns in renderNodeToBuffer() for node.hidden and display='none' don't clear dirty flags. Stale subtreeDirty blocks future markSubtreeDirty() propagation — same class as the virtual text bug already fixed. Fix: clearDirtyFlags(node) before return on hidden/display-none paths. Found by GPT pipeline review (3/3 reviewers flagged as high severity).

