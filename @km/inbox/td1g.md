---
id: "@km/_orphan/td1g"
aliases:
  - km-td1g
created_at: 2026-01-20T16:41:17Z
closed_at: 2026-01-20T16:43:55Z
---

# [x] TTY not restored on crash @km/_orphan #bug #P1

When the TUI crashes (e.g., SQLite disk I/O error), the terminal is not properly restored. User is left with broken terminal state.