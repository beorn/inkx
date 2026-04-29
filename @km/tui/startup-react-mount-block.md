---
id: "@km/tui/startup-react-mount-block"
aliases:
  - km-tui.startup-react-mount-block
  - km-tui-startup-react-mount-block
created_by: claude:8b5b9e1c
created_at: 2026-04-20T17:38:46Z
closed_at: 2026-04-20T18:22:10Z
close_reason: "Fixed: added width={storeDimensions.columns} to single-pane Box
  in Board.tsx. Before: paneRect oscillated 0→230→240→160 causing 5 cascade
  renders (1028 TreeNode calls, 742ms event-loop block). After: paneRect settles
  in single layout pass (292 TreeNode calls, no block warning, run-board
  1111ms→970ms). All 6655 km tests pass."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
---

# [x] TUI blocks event loop ~1s during startup:react-mount @km/tui #bug #P2 @claude:8b5b9e1c

After 'km view <vault>' completes load + board init, the TUI is unresponsive for ~1s with 'event loop blocked for 1059ms — (startup:react-mount) — render: layout=41ms (total=41ms) — (2 renders)'. Layout and render are fast (41ms); the block is in React mount or sync I/O between renders.