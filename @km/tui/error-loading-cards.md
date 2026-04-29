---
id: "@km/tui/error-loading-cards"
aliases:
  - km-tui.error-loading-cards
  - km-tui-error-loading-cards
created_by: claude:fcaad2fa
created_at: 2026-02-18T14:20:25Z
closed_at: 2026-02-19T08:10:20Z
---

# [x] Error loading cards view after search navigation + detail pane close @km/tui #bug #P2 @claude:36393b5d

After search navigating to a card, opening detail pane, closing it, and navigating, the board shows 'Error loading cards view' with a blank screen. Seen in TTY with asana vault. May be related to zoom/navigation state getting corrupted.