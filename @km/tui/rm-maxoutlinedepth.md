---
id: "@km/tui/rm-maxoutlinedepth"
aliases:
  - km-tui.rm-maxoutlinedepth
  - km-tui-rm-maxoutlinedepth
created_by: claude:ee8efc0f
created_at: 2026-02-22T01:23:58Z
closed_at: 2026-02-22T02:10:09Z
owner: bjorn@stabell.org
assignee: claude:ee8efc0f
---

# [x] Remove maxOutlineDepth — derive fold visibility from foldedNodes only @km/tui #task #P1 @claude:ee8efc0f

Like Decker, remove the global maxOutlineDepth limit. Visibility is controlled solely by foldedNodes set. H/L operate on foldedNodes using computed depth (setFoldLevel pattern). Initial depth-2 behavior achieved by pre-folding nodes at depth >= 2 when card first renders.