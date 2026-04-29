---
id: "@km/cli/init-prompt-corrupts-tui"
aliases:
  - km-cli.init-prompt-corrupts-tui
  - km-cli-init-prompt-corrupts-tui
created_by: claude:019d032d
created_at: 2026-04-22T18:58:53Z
closed_at: 2026-04-22T20:11:12Z
close_reason: superseded by km-silvery.layout-churn-leaks-pixels (root cause is
  silvery pipeline, not km-cli)
owner: bjorn@stabell.org
assignee: claude:019d032d
---

# [x] Init-prompt path corrupts TUI rendering: broken borders, leaked chars, full-height scroll indicators @km/cli #bug #P0 @claude:019d032d

Repro (120x40 PTY): 1) mkdir -p /tmp/v/{inbox,done,next}; echo '# T1' > /tmp/v/inbox/t1.md; 2) bun km view /tmp/v; 3) Answer 'Y' to init prompt; 4) Press Enter. Observed: After init output prints to stdout and TUI enters alt screen, the board renders with: (a) card borders broken across rows — top+bottom borders disconnected from content rows by a long ─── dash line segment; (b) scroll indicators (▸) stamped on every row of the screen height, not just where needed; (c) duplicate cards (Done task 2 appears twice visually); (d) stray ▸/dashes in middle of empty column; (e) init-prompt input bytes (y, n) leak into the bottom status bar ('📋y1 📄n6' instead of '📋 1 📄 6'). Second test: SAME vault with .km/ pre-existing (init prompt skipped) renders PERFECTLY. So the corruption is caused by the init-prompt flow's output interacting with TUI startup. Files to look at: apps/@km/_orphan/cli/src/memory-mode-prompt.ts (readline.createInterface with terminal:false on process.stdin), apps/@km/_orphan/cli/src/commands/view.ts lines 107-124 (init path), apps/@km/tui/src/tui.tsx ~line 398-430 (run with alternateScreen:true). Evidence: /tmp/explore-screenshots/01-startup-broken.png and /tmp/explore-screenshots/02-no-debug-still-broken.png.