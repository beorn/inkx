---
id: "@km/tui/windowing-detail"
aliases:
  - km-tui.windowing-detail
  - km-tui-windowing-detail
created_by: claude:d3a7049b
created_at: 2026-02-22T07:35:11Z
closed_at: 2026-02-22T09:03:53Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Windowing: externalize detail as a pane type @km/tui #task #P2 @claude:d3a7049b

Phase 2: Detail pane is no longer special-cased inside Board. It becomes a pane with view type 'detail'. Remove showDetailPane from UIState. No visual change yet — detail renders the same, just as a pane.