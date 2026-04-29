---
id: "@km/tui/search-repaint"
aliases:
  - km-tui.search-repaint
  - km-tui-search-repaint
created_by: claude:36393b5d
created_at: 2026-02-18T22:18:32Z
closed_at: 2026-02-19T07:06:54Z
owner: bjorn@stabell.org
---

# [x] Search dialog: black area when results shrink @km/tui #bug #P2

Search dialog changes size dynamically based on results. When it shrinks, the revealed area isn't repainted — remains black.