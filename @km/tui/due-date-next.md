---
id: "@km/tui/due-date-next"
aliases:
  - km-tui.due-date-next
  - km-tui-due-date-next
created_by: claude:a5c7f7de
created_at: 2026-02-15T07:55:55Z
closed_at: 2026-02-15T14:13:41Z
---

# [x] Nodes with due_date don't automatically appear on @next (missing rule?) @km/tui #bug #P2 @claude:a5c7f7de

Solved via template change: Inbox column on @next now has add= rules for due:past, due:today, due:week, and start:past queries, pulling in dated tasks automatically. No storage-layer changes needed — the existing query system already supports date filtering.