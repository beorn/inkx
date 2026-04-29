---
id: "@km/tui/progressive-fold"
aliases:
  - km-tui.progressive-fold
  - km-tui-progressive-fold
created_by: claude:ee8efc0f
created_at: 2026-02-22T00:42:29Z
closed_at: 2026-02-22T00:59:34Z
owner: bjorn@stabell.org
assignee: claude:ee8efc0f
---

# [x] H/L progressive fold/unfold — reveal more depth levels @km/tui #feature #P2 @claude:ee8efc0f

H/L fold/unfold is currently binary (folded or not). User expects progressive behavior: pressing L multiple times reveals deeper levels of the tree (grandchildren, great-grandchildren), pressing H multiple times collapses deeper levels first. Current impl: FOLD_NODE adds card.id to foldedNodes set, UNFOLD_NODE removes it. No per-card depth tracking. Need: per-card outline depth that L increments and H decrements.