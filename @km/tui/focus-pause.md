---
id: "@km/tui/focus-pause"
aliases:
  - km-tui.focus-pause
  - km-tui-focus-pause
created_by: claude:d1f60fb4
created_at: 2026-02-25T23:32:48Z
closed_at: 2026-03-10T15:36:59Z
close_reason: Heartbeat, spinner, elapsed timer all pause when terminal loses
  focus. Focus detection via ANSI focus reporting protocol in term-provider.
---

# [x] Pause background timers when terminal loses focus @km/tui #feature #P2 @claude:55df8ef1

Enable focus reporting (CSI ?1004h). Pause heartbeat interval (200ms), board bar timer, CommandBox spinner when terminal blurs. Resume on focus-in. Battery/CPU savings.

Files: @km/tui tui.tsx, board-bottom-bar, CommandBox. New: use-interval-manager hook.
Depends on: @km/silvery-legacy/focus-report