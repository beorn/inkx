---
id: "@km/tui/windowing-goto"
aliases:
  - km-tui.windowing-goto
  - km-tui-windowing-goto
created_by: claude:d3a7049b
created_at: 2026-02-22T07:35:36Z
closed_at: 2026-02-22T09:46:51Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Windowing: wire go-to commands to panes (gp, gn, Ctrl+D, Shift+Enter) @km/tui #task #P2 @claude:d3a7049b

Phase 6: gp opens board picker in current pane, gt/gx smart-route (focus if already open, else open in current), gn splits + board picker in new pane, Ctrl+D toggles detail pane, Shift+Enter opens in new independent pane. Linked pane numbering (2d, 2s, 2j).