---
id: "@km/tui/1-search-dialog-rendering-artifacts-when-scrolling"
aliases:
  - km-tui.1
  - km-tui-1
  - "@km/tui/1"
created_at: 2026-02-04T13:38:30Z
closed_at: 2026-02-04T13:54:46Z
assignee: claude:27f1a547
---

# [x] Search dialog rendering artifacts when scrolling @km/tui #bug #P2 @claude:27f1a547

When scrolling through search results with arrow keys, visual artifacts appear showing duplicate/overlapping content. Likely inkx rendering issue with overflow:hidden and dynamic content updates. See screenshot 2026-02-04 at 13.33.30.