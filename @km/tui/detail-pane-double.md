---
id: "@km/tui/detail-pane-double"
aliases:
  - km-tui.detail-pane-double
  - km-tui-detail-pane-double
created_by: claude:28b14b32
created_at: 2026-02-23T16:44:37Z
closed_at: 2026-02-25T20:10:45Z
owner: bjorn@stabell.org
assignee: claude:d697f216
---

# [x] 'D' opens detail pane AND empty workspace pane @km/tui #bug #P2 @claude:d697f216

Pressing D triggers both the legacy showDetailPane rendering and creates a new workspace pane with viewType='detail'. WorkspaceView only renders 'board' viewType — 'detail' falls through to EmptyPaneWelcome. Result: detail content on left + empty [1d] pane on right. Root cause: openDetailPane() in board-app-store.ts creates workspace pane + sets showDetailPane=true, but WorkspaceView.tsx:159 doesn't handle viewType='detail'. Likely resolved by windowing WIP (jotai migration).