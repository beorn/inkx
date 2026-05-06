---
mentions:
  - km
  - claude
id: "@km/inbox/6bsxz"
aliases:
  - km-6bsxz
  - "@km/_orphan/6bsxz"
created_by: claude:b92140a2
created_at: 2026-03-17T22:23:54Z
closed_at: 2026-03-19T17:31:12Z
close_reason: "Fixed: view.ts handleFatalError() + restoreTerminalState() exits
  alt screen before printing errors. uncaughtException/unhandledRejection
  handlers + try/catch/finally wrapper. Test: pre-existing tests pass."
owner: bjorn@stabell.org
assignee: claude:21c57d63
---

# [x] Fatal errors in alt screen are lost — switch to normal screen before printing @km/_orphan #bug #P2 @claude:21c57d63

When km crashes in the TUI (alternate screen), the full error/stacktrace is shown in the alt screen buffer. But clicking the window or the crash itself switches back to the normal screen, and only a short error is visible. The full stacktrace is lost.

Fix: catch fatal errors at the top level, switch to normal screen (exit alternate screen buffer) BEFORE printing the error to stderr. Also log the full error to a file via loggily.

Affected: apps/@km/_orphan/cli/src/commands/view.ts — needs try/catch around the main action with alt screen cleanup.
Related: silvery app cleanup, process.on('uncaughtException').

