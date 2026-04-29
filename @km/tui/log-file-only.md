---
id: "@km/tui/log-file-only"
aliases:
  - km-tui.log-file-only
  - km-tui-log-file-only
created_by: claude:b509d761
created_at: 2026-02-11T10:18:14Z
closed_at: 2026-02-12T14:25:04Z
owner: bjorn@stabell.org
assignee: claude:586bad48
---

# [x] Suppress console.debug when DEBUG_LOG set to avoid TUI re-renders @km/tui #task #P3 @claude:586bad48

When DEBUG_LOG is set, @beorn/logger writeLog() and debug package customLog() still call console.debug() in TUI mode. This triggers patchConsole → Console component state update → React re-render → layout cascade. Fix: when DEBUG_LOG is set AND TUI is active, write to file only — suppress console.debug() calls for debug-level output. This prevents the layout cascade entirely. The Console component is useful for interactive debugging, but when you've explicitly routed to a file, the TUI shouldn't be disrupted. Implementation: add a flag to @beorn/logger (e.g. suppressConsole) and check in writeLog(). In debug-log.ts customLog(), skip console.debug() when stream is open.