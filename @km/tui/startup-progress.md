---
mentions:
  - km
  - claude
id: "@km/tui/startup-progress"
aliases:
  - km-tui.startup-progress
  - km-tui-startup-progress
created_at: 2026-02-05T14:50:45Z
closed_at: 2026-02-05T15:07:55Z
assignee: claude:b53ef7e4
---

# [x] Startup progress (Load repo, Apply rules) cleared when TUI enters alt screen @km/tui #bug #P2 @claude:b53ef7e4

Startup progress lines (○ Load repo, ○ Apply rules, etc.) should be fully visible in two places:

1. **After exiting the app**: all progress lines should remain in terminal scrollback
2. **On the regular/normal screen** (backtick screen-switch): progress should be visible there too

Currently only '○ Load repo' shows — the rest are lost. The CLI spinner/progress output gets partially overwritten or cleared before the alt screen takes over.

Root cause: The CLI progress display likely overwrites previous lines (spinner behavior), so by the time alt screen activates, only the last line survives in scrollback.

