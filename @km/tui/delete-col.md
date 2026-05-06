---
mentions:
  - km
id: "@km/tui/delete-col"
aliases:
  - km-tui.delete-col
  - km-tui-delete-col
created_by: claude:949598cc
created_at: 2026-02-12T09:52:33Z
closed_at: 2026-02-12T10:10:28Z
owner: bjorn@stabell.org
---

# [x] Del on column/board should work with confirmation dialog @km/tui #feature #P2

Pressing Del on a column or board currently does nothing. Should prompt a confirmation dialog before deleting. If deleting lots of content, use a stronger warning or two-step confirmation. Depends on @km/tui/confirm-dialog for the dialog component.

