---
id: "@km/tui/flash-on-update"
aliases:
  - km-tui.flash-on-update
  - km-tui-flash-on-update
created_at: 2026-02-05T15:09:11Z
closed_at: 2026-02-06T21:45:43Z
---

# [x] Bottom bar flash-on-update: bright white text that fades to grey @km/tui #feature #P2 @claude:a3625ec3

When bottom bar indicators update (console stats change, watcher status change, etc.), the updated text should briefly flash bright white for a few seconds before fading back to grey (dimColor). This draws attention to changing info without being intrusive.

Same pattern should apply to all updating bottom bar info — not just console stats. Reusable animation primitive needed.

Design from user: 'ideally show the text and the numbers in bright white for a few seconds before going back to grey (we should do this for all info that updates to draw attention to it - like toasts)'