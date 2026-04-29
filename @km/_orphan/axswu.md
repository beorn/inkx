---
id: "@km/_orphan/axswu"
aliases:
  - km-axswu
created_by: claude:124bfbe5
created_at: 2026-02-12T15:01:50Z
closed_at: 2026-02-14T20:48:43Z
---

# [x] TUI: breadcrumb text corruption on h/l column navigation @km/_orphan #bug #P2 @claude:124bfbe5

Breadcrumb bar doesn't fully clear previous text when navigating h/l between columns. Characters from old breadcrumb leak through: Processing→Waiting shows PWaiting, col-deep→col-one shows col-done. Worse at narrow terminals (80x24: bcal- eep). 100% repro rate.