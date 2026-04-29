---
id: "@km/tui/body-indicator-redundant"
aliases:
  - km-tui.body-indicator-redundant
  - km-tui-body-indicator-redundant
created_by: claude:8f007ba9
created_at: 2026-02-20T07:43:35Z
closed_at: 2026-02-20T08:03:19Z
owner: bjorn@stabell.org
---

# [x] Body indicator (···) shows even when body content already visible @km/tui #bug #P2

The ··· body indicator should only show when the item has hidden body content not already visible. If the item already displays body content (e.g., as a board with columns, as a column with cards, or as single-line subitems), the ··· is redundant and clutters the display. Only show ··· when body content exists but is NOT currently displayed in any form.