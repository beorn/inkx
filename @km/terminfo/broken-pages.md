---
id: "@km/terminfo/broken-pages"
aliases:
  - km-terminfo.broken-pages
  - km-terminfo-broken-pages
created_by: claude:491faf6c
created_at: 2026-03-25T19:56:57Z
closed_at: 2026-03-25T20:18:50Z
close_reason: "Fixed all 3: (1) vscode→vs-code slug in terminals.json, (2)
  xterm-js removed from sidebar (subsumed by VS Code), (3) sgr-23-reset-italic
  probe added to all 14 backends"
---

# [x] terminfo.dev: 3 broken pages (404) — vscode, xterm-js, sgr-23-reset-italic @km/terminfo #bug #P2

Found by /test-site deep scan (2026-03-25). 184 pages tested, 3 return 404:

1. /terminal/vscode — likely should be /terminal/vs-code (hyphenated)
2. /terminal/xterm-js — page doesn't exist, needs to be created
3. /sgr/sgr-23-reset-italic — page doesn't exist, likely not generated

These are linked from somewhere on the site (navigation or feature matrix) but the target pages don't exist.