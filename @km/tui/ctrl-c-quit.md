---
id: "@km/tui/ctrl-c-quit"
aliases:
  - km-tui.ctrl-c-quit
  - km-tui-ctrl-c-quit
created_by: claude:a5c7f7de
created_at: 2026-02-15T09:18:48Z
closed_at: 2026-02-15T09:21:44Z
owner: bjorn@stabell.org
---

# [x] Ctrl-C should always quit the app @km/tui #bug #P2

Ctrl-C should always work as a way to quit the app, regardless of current mode or dialog state. Currently it may not work in certain states.