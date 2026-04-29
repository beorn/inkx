---
id: "@km/inkx/notifications"
aliases:
  - km-inkx.notifications
  - km-inkx-notifications
created_by: claude:ee8efc0f
created_at: 2026-02-22T23:29:18Z
closed_at: 2026-02-22T23:55:04Z
---

# [x] Terminal notifications: OSC 9 (iTerm2) + OSC 99 (Kitty) @km/inkx #task #P3 @claude:ee8efc0f

CC sends terminal notifications when background tasks complete: OSC 9 for iTerm2 and OSC 99 for Kitty. This allows the terminal to show a native notification when a long-running operation finishes while the user has switched to another app/tab. inkx should expose a notify() API on the output layer that auto-detects terminal type and sends the appropriate escape sequence.