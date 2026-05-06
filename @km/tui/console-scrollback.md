---
mentions:
  - km
  - claude
id: "@km/tui/console-scrollback"
aliases:
  - km-tui.console-scrollback
  - km-tui-console-scrollback
created_at: 2026-02-05T14:50:39Z
closed_at: 2026-02-05T15:07:55Z
assignee: claude:b53ef7e4
---

# [x] Console errors/warnings not visible during screen-switch @km/tui #bug #P2 @claude:b53ef7e4

When pressing backtick to switch to normal screen, console errors/warnings are not visible. They only show on app exit. The screen-switching effect leaves alt screen but console output went to the alt buffer during the TUI session, so scrollback is empty. Need to replay captured entries to stdout/stderr when switching to normal screen.

