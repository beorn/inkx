---
id: "@km/_orphan/jfr6"
aliases:
  - km-jfr6
created_at: 2026-01-24T22:27:50Z
closed_at: 2026-01-24T22:31:24Z
assignee: claude-1769322490
---

# [x] inkx constant render loop - renders every ~60ms when idle @km/_orphan #bug #P1 @claude-1769322490

When running `debug km view`, the inkx scheduler shows constant renders every ~60ms even when nothing is changing. The TUI should only re-render on state changes, not continuously loop.

Example output:
```
inkx:scheduler render #854 complete: 21ms, output: 0 bytes +21ms
inkx:scheduler render scheduled +60ms
```

This is a performance issue that wastes CPU and may be related to the blank screen bug.