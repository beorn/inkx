---
mentions:
  - km
id: "@km/tui/fold-unfold-bug"
aliases:
  - km-tui.fold-unfold-bug
  - km-tui-fold-unfold-bug
created_by: claude:97b8de73
created_at: 2026-02-22T23:32:29Z
closed_at: 2026-02-23T00:38:20Z
owner: bjorn@stabell.org
---

# [x] UNFOLD_NODE reveals too many levels: > shows section content instead of just headers @km/tui #bug #P2

When pressing > (unfold_all scope:root), sections like Activity get unfolded, revealing all their leaf children (date entries). Expected: > should reveal section headers only, keeping their content folded. Root cause: auto-fold in UNFOLD_NODE only re-folds children with grandchildren. Leaf children of sections remain visible. Fix options: (1) Track boardFoldLevel counter and recompute folds at each level, (2) re-fold unfolded nodes that have children, (3) depth-based progressive disclosure.

