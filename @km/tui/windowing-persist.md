---
id: "@km/tui/windowing-persist"
aliases:
  - km-tui.windowing-persist
  - km-tui-windowing-persist
created_by: claude:d3a7049b
created_at: 2026-02-22T07:35:44Z
closed_at: 2026-02-22T21:04:38Z
owner: bjorn@stabell.org
---

# [x] Windowing: workspace save/restore persistence @km/tui #task #P3

Phase 7: :workspace save/load/list/delete commands. Save pane layout tree, view types, targets, view modes, fold state, focus position. Store as JSON in .km/workspaces/ or SQLite. Auto-save on exit, restore on launch.