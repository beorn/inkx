---
id: "@km/tui/collapse-sticky-select"
aliases:
  - km-tui.collapse-sticky-select
  - km-tui-collapse-sticky-select
created_by: claude:a5c7f7de
created_at: 2026-02-14T16:14:18Z
closed_at: 2026-02-14T20:37:35Z
owner: bjorn@stabell.org
---

# [x] Collapsed column not shown as selected when stickyY is below column head @km/tui #bug #P2

When cursoring left/right over collapsed columns and stickyY is not at the column head level (but further down), the collapsed column fails to show as selected. If you cursor left/right along the column heads then it does show up as selected.