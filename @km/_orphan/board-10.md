---
id: "@km/_orphan/board-10"
aliases:
  - km-board-10
created_at: 2026-01-27T15:39:24Z
closed_at: 2026-01-27T16:06:48Z
assignee: claude:193f30b3
---

# [x] TUI cursor cannot navigate into board title, only column title @km/_orphan #bug #P2 @claude:193f30b3

When using 'k' to cursor up in the TUI, cursor stops at column title and cannot reach the board title.

Steps to reproduce:
1. Run: km view /tmp/tst-vault1
2. Press 'k' repeatedly to move cursor up
3. Observe: Cursor stops at column title

Expected: Cursor should be able to move into the board title
Actual: Cursor stops at column title level