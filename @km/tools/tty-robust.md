---
id: "@km/tools/tty-robust"
aliases:
  - km-tools.tty-robust
  - km-tools-tty-robust
created_at: 2026-02-07T22:17:35Z
closed_at: 2026-02-07T22:26:26Z
assignee: claude:88dcecbc
---

# [x] Make TTY tools robust and fast (headless screenshots + new engine) @km/tools #feature #P2 @claude:88dcecbc

Part A: Add bufferToHTML() to inkx + screenshot() to App (headless PNG screenshots). Part B: Replace ttyd+Playwright-as-terminal with Bun.Terminal + @xterm/headless for TTY server.