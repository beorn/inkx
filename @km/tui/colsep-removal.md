---
mentions:
  - km
  - claude
id: "@km/tui/colsep-removal"
aliases:
  - km-tui.colsep-removal
  - km-tui-colsep-removal
created_by: claude:d697f216
created_at: 2026-02-25T14:21:31Z
closed_at: 2026-02-25T17:18:49Z
owner: bjorn@stabell.org
assignee: claude:d697f216
---

# [x] Column separator removal: evaluate 0-width separator between columns @km/tui #task #P2 @claude:d697f216

Changed ColumnSeparator from width=1 to width=0 per user request to try without the blank line between columns. May need reverting if columns look too cramped. Also: right overflow indicator may have a blank line between it and the rightmost card — investigate.

