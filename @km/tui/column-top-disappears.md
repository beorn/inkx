---
id: "@km/tui/column-top-disappears"
aliases:
  - km-tui.column-top-disappears
  - km-tui-column-top-disappears
created_by: claude:8b5b9e1c
created_at: 2026-04-20T16:56:58Z
closed_at: 2026-04-21T03:01:28Z
close_reason: FIXED — see full notes. User confirmed 2026-04-21.
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-tui.column-top-disappears
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-20T09:57:18Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Column top disappears on cursor-down, reappears on cursor-up @km/tui #bug #P1 @claude:8b5b9e1c

blocks:: [[@km/tui]]

When cursoring down in a column with many cards, the top of the column (header or leading cards) disappears. Cursoring back up restores them. Symptom suggests column height miscalculation or race condition in scroll tier / incremental rendering. Recurring report: prior recall shows this bug was observed before but unresolved.