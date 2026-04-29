---
id: "@km/tui/outline-nav-viewtree"
aliases:
  - km-tui.outline-nav-viewtree
  - km-tui-outline-nav-viewtree
created_by: Bjørn Stabell
created_at: 2026-04-02T22:07:13Z
closed_at: 2026-04-02T22:19:53Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Outline nav (j/k normal mode) uses foldDepth not ViewTree — same class of bug as block nav @km/tui #bug #P1 @Bjørn Stabell

getVisibleDescendantIds at board-actions-nav.ts:83 uses foldDepth-limited repo walk for outline navigation. Same bug class as the block nav fix (1ccd6996): navigation can disagree with rendering about what's visible. Should use ViewTree like getVisibleColumnBlocks now does.