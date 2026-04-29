---
id: "@km/tui/windowing-wire"
aliases:
  - km-tui.windowing-wire
  - km-tui-windowing-wire
created_by: claude:d3a7049b
created_at: 2026-02-22T20:24:47Z
closed_at: 2026-02-22T21:04:37Z
owner: bjorn@stabell.org
assignee: claude:28b14b32
---

# [x] Windowing: wire multi-pane rendering + pane commands in view layer @km/tui #task #P2 @claude:28b14b32

Wire the existing store actions (split, close, focus, resize, zoom, swap) to actual multi-pane rendering in Board.tsx. Currently the store supports workspaces but the view layer only renders a single pane. This task connects the two layers.