---
id: "@km/inbox/u25nj"
aliases:
  - km-u25nj
  - "@km/_orphan/u25nj"
created_by: claude:124bfbe5
created_at: 2026-02-12T17:09:43Z
closed_at: 2026-02-12T19:06:45Z
owner: bjorn@stabell.org
assignee: claude:124bfbe5
---

# [x] TUI: Stale cursor after deleting all cards in column @km/_orphan #bug #P3 @claude:124bfbe5

After deleting all cards in a column (Backspace x2), the cursor still references the last deleted node ID. Navigating (l) produces: ERROR km:nav cursor node not in repo: B, falling back to root. The delete handler should update cursor to column header or next column when last card is removed. Test: apps/@km/tui/tests/stale-cursor-after-delete-all.test.ts