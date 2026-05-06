---
mentions:
  - km
  - claude
id: "@km/tui/windowing-store"
aliases:
  - km-tui.windowing-store
  - km-tui-windowing-store
created_by: claude:d3a7049b
created_at: 2026-02-22T07:35:06Z
closed_at: 2026-02-22T08:54:29Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Windowing: refactor store to workspace/panes/global structure @km/tui #task #P2 @claude:d3a7049b

Phase 1: Refactor Zustand store from flat board state to { workspace: { panes, layout, focusedId }, global }. Single-pane still — no visual change. Extract PaneState type from current BoardAppStore.

