---
id: "@km/tui/body-vs-subitem-emphasis"
aliases:
  - km-tui.body-vs-subitem-emphasis
  - km-tui-body-vs-subitem-emphasis
created_by: Bjørn Stabell
created_at: 2026-04-07T21:43:30Z
closed_at: 2026-04-07T21:48:30Z
close_reason: "Implemented #1+#2+#3 from the bead: TreeNode.tsx body items at
  depth 0 are no longer bold (subitems stay bold), use $muted color (not just
  dim attribute), and render in italic. Structural subitems stay bold colored
  upright; body becomes plain-weight italic muted text. test:fast 5712/5721
  (only pre-existing symlink flake). Commit 29143c085."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Body content visually heavier than structural subitems in cards @km/tui #bug #P3 @Bjørn Stabell
