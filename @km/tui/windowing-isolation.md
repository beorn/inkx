---
id: "@km/tui/windowing-isolation"
aliases:
  - km-tui.windowing-isolation
  - km-tui-windowing-isolation
created_by: claude:d3a7049b
created_at: 2026-02-22T20:24:54Z
closed_at: 2026-02-22T21:04:37Z
owner: bjorn@stabell.org
assignee: claude:28b14b32
---

# [x] Windowing: per-pane state isolation (cursor, folds, nav) @km/tui #task #P2 @claude:28b14b32

Each pane needs its own cursor, fold state, nav history, and view mode. Currently flat store fields are shared. Migrate consumers to read from workspace.panes.get(focusedPaneId) instead of flat state.