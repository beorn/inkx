---
id: "@km/tui/comments-as-cards"
aliases:
  - km-tui.comments-as-cards
  - km-tui-comments-as-cards
created_by: claude:36393b5d
created_at: 2026-02-18T22:59:19Z
closed_at: 2026-02-19T08:10:20Z
owner: bjorn@stabell.org
assignee: claude:36393b5d
---

# [x] Asana comments render as separate cards in column (should be detail-pane only) @km/tui #bug #P2 @claude:36393b5d

In FAMILY SPRINT > Waiting column, the 'Fix rap sheet' task has 22 children shown in the column. Most are Asana comments rendered as individual cards with '·' prefix. Example: 'From Jesse 241203: DHS TRIP, get a determination letter...' and 'From Craig 250113: p.s. Bjorn, my apologies...' — these are multi-paragraph email-style comments that take up the entire column (212 items, ▼63 overflow). In Asana, these are comments visible only in the task detail pane, NOT as separate cards in the board view. Root cause: Asana import creates these as child nodes of the task. The column view shows ALL children as cards. Need to either: (a) filter comment nodes from card view, or (b) restructure import to put comments in a different location (e.g. metadata/notes rather than children).