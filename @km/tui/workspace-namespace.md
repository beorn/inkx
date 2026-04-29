---
id: "@km/tui/workspace-namespace"
aliases:
  - km-tui.workspace-namespace
  - km-tui-workspace-namespace
created_by: Bjørn Stabell
created_at: 2026-04-02T23:19:40Z
closed_at: 2026-04-02T23:26:44Z
close_reason: Workspace namespace extracted with 5 helpers. 13 source files
  updated. Bare aliases kept for tests. Commit 42100ff4.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Extract Workspace namespace — getActiveBoardPane, getFocusedPane helpers @km/tui #task #P2 @Bjørn Stabell

getActiveBoardPane(), getParentBoardPane() are bare functions. 20+ sites access state.workspace.panes directly. Extract Workspace namespace. ~1 hour.