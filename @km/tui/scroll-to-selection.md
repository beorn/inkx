---
id: "@km/tui/scroll-to-selection"
aliases:
  - km-tui.scroll-to-selection
  - km-tui-scroll-to-selection
created_by: claude:36393b5d
created_at: 2026-02-18T23:42:53Z
closed_at: 2026-02-19T07:19:12Z
owner: bjorn@stabell.org
---

# [x] Scroll to selected card after zoom (card may be off-screen) @km/tui #bug #P2

Investigation found scroll-to-selection mechanism already works correctly. VirtualList + ScrollTracker properly scroll to cursor after ZOOM_IN/SELECT. 5 new tests added confirming behavior in Cards view, Columns view, and DOM state. If user still sees the bug, may need real-vault reproduction with INKX_STRICT=1.