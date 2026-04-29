---
id: "@km/tui/console-count"
aliases:
  - km-tui.console-count
  - km-tui-console-count
created_at: 2026-02-05T12:16:46Z
closed_at: 2026-02-05T12:19:11Z
assignee: claude:3d543eef
---

# [x] bug(tui): console status bar count doesn't update when log messages appear @km/tui #bug #P3 @claude:3d543eef

The console indicator in the bottom status bar (e.g. 🖥️5) doesn't update its count as new log messages arrive. It likely only reflects the initial count at render time and doesn't re-render when patchedConsole entries change.