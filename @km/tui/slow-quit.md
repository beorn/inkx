---
id: "@km/tui/slow-quit"
aliases:
  - km-tui.slow-quit
  - km-tui-slow-quit
created_at: 2026-02-05T16:58:27Z
closed_at: 2026-02-05T17:45:20Z
assignee: claude:b53ef7e4
---

# [x] 5-10 second delay after pressing q to quit @km/tui #bug #P2 @claude:b53ef7e4

After pressing 'q' to quit km view, the screen returns to the normal terminal immediately but the process hangs for 5-10 seconds before the shell prompt returns. This suggests cleanup/disposal is blocking — likely the file watcher, database connections, or some async teardown that waits for a timeout instead of cleaning up promptly.

Repro: km view ~/Bear/Vault, press q, wait ~5-10s for shell prompt.