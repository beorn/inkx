---
id: "@km/tui/edit-display"
aliases:
  - km-tui.edit-display
  - km-tui-edit-display
created_by: claude:97217d5d
created_at: 2026-02-16T23:11:14Z
closed_at: 2026-02-17T00:53:56Z
owner: bjorn@stabell.org
---

# [x] Text typed during inline edit doesn't display (but saves on Enter) @km/tui #bug #P1

User reports: when editing a body block, typing shows nothing on screen. But pressing Enter saves the typed text AND creates a new node. The Slate editor captures input but InlineEditField doesn't visually update.

Reproduced in TTY emulator: entered edit mode on body block, typed "x" and "y" — neither appeared. Pressed Escape — text showed "vault.fffxy" confirming characters were captured by Slate but never displayed.

Root cause investigation (incomplete):
- Production render uses ConcurrentRoot + runWithDiscreteEvent + flushSyncWork + async queueMicrotask scheduler
- Test render uses act() + synchronous doRender() — this is why tests pass
- insertChar() calls Editor.insertText then forceRender() (setVersion(v+1))
- The state update should be flushed by reconciler.flushSyncWork() after handleChunk
- Either flushSyncWork fails to process the update, or the scheduler/incremental diff misses the change
- Debug logging was being added to trace the exact failure point when investigation was paused