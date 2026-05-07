---
mentions:
  - km
  - claude
id: "@km/inkx/slow-frame-warn"
aliases:
  - km-inkx.slow-frame-warn
  - km-inkx-slow-frame-warn
created_by: claude:ee8efc0f
created_at: 2026-02-22T23:29:24Z
closed_at: 2026-02-22T23:55:05Z
owner: bjorn@stabell.org
assignee: claude:ee8efc0f
---

# [x] Slow frame warnings: log when render exceeds threshold @km/inkx #task #P3 @claude:ee8efc0f

CC logs a warning when a frame takes >50ms to render. inkx already tracks frame timing in its performance metrics but doesn't emit warnings. Add a configurable threshold (default 50ms) that logs slow frames with diagnostic info (what triggered the render, how many nodes were laid out, how many cells were diffed). Easy win for debugging performance issues.

