---
id: "@km/inkx/mouse-runtime"
aliases:
  - km-inkx.mouse-runtime
  - km-inkx-mouse-runtime
created_by: claude:d3a7049b
created_at: 2026-02-20T14:05:56Z
closed_at: 2026-02-20T14:18:09Z
---

# [x] Wire mouse events into runtime (run/createApp) @km/inkx #task #P3 @claude:d3a7049b

run() and createApp() don't enable mouse tracking or parse mouse sequences. Should: (1) enable SGR mouse mode on startup, (2) parse mouse sequences in the input loop, (3) emit MouseEvent through the event system, (4) disable on exit. Hit registry dispatch should be opt-in via a hook.