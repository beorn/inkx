---
id: "@km/tui/breadcrumb-multiline-content"
aliases:
  - km-tui.breadcrumb-multiline-content
  - km-tui-breadcrumb-multiline-content
created_by: claude:8b5b9e1c
created_at: 2026-04-20T23:33:57Z
closed_at: 2026-04-21T00:25:25Z
close_reason: "Fixed. Test: apps/km-tui/tests/breadcrumb.test.ts:355+380
  (clampSegmentLabel unit + integration). Before: cursor on multi-line body card
  caused top bar to span multiple rows ('line two' rendered on row 1, 'line
  three...' on row 2). After: first line + ellipsis stays on row 1. Fix: new
  clampSegmentLabel/clampSegmentLabels helpers in
  apps/km-tui/src/layout/path.ts; applied in BoardView.tsx before renderPath
  (width calc accuracy) and defensively in TopBarBreadcrumb; also applied in
  useBoardController.ts for OSC 2 window title. Commit 05e757517."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-tui.breadcrumb-multiline-content
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-20T16:34:11Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] [bug] Breadcrumb shows full body content — should clamp to first line @km/tui #bug #P2 @claude:8b5b9e1c

blocks:: [[@km/tui]]

TopBarBreadcrumb in apps/@km/tui/src/views/BoardView.tsx renders segment names that can include multiline content (body cards). Clamp to first line with ellipsis.