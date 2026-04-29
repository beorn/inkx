---
id: "@km/tui/console-rework"
aliases:
  - km-tui.console-rework
  - km-tui-console-rework
created_at: 2026-02-05T13:53:24Z
closed_at: 2026-02-05T15:18:59Z
---

# [x] feat(tui): replace ConsoleModal with screen-switching + count-only indicator @km/tui #feature #P2

Replace the in-memory console capture buffer and ConsoleModal overlay with:
1. Count-only patchConsole (no entry storage, just counts for status bar indicator)
2. Screen switching via backtick: leave alt screen to see normal terminal, ESC to return
3. Status bar shows: LOGS [icon]count (warnings) press ` to see / press ESC to close
4. Flash white on count update (brief attention draw)

Removes need for in-memory console log storage. Alt screen limitation means console output during TUI goes to alt buffer (invisible), but user can switch to normal screen to see terminal output.