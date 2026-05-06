---
mentions:
  - km
  - claude
id: "@km/silvery/mouse-leak"
aliases:
  - km-silvery.mouse-leak
  - km-silvery-mouse-leak
created_by: claude:d29abbfa
created_at: 2026-03-18T19:03:25Z
closed_at: 2026-03-18T19:05:26Z
close_reason: "Fixed: reordered cleanup in create-app.tsx — terminal protocol
  disable (mouse, kitty, focus, alt screen) now happens BEFORE provider cleanup
  (which disables raw mode). Uses writeSync for reliability. Added ordering test
  in inline-mouse-default.test.tsx."
owner: bjorn@stabell.org
assignee: claude:d29abbfa
---

# [x] Mouse tracking bytes leak to shell on exit — cleanup order wrong @km/silvery #bug #P1 @claude:d29abbfa

On app exit, raw mode is disabled (provider cleanup at L884) BEFORE mouse tracking is disabled (L901 stdout.write async). This means the shell takes over stdin while terminal still has mouse tracking enabled, so mouse events appear as garbled text (e.g. 35;73;26M) on the shell prompt.

Fix: use writeSync for mouse/kitty/focus disable sequences, and do it BEFORE provider cleanup (which disables raw mode). The restoreTerminalState() in terminal-lifecycle.ts already has the correct order — the create-app.tsx cleanup should use it or replicate the order.

Screenshot: ~/Desktop/Screenshot 2026-03-18 at 12.00.40.png

