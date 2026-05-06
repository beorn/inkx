---
mentions:
  - km
  - claude
id: "@km/tui/body-merge"
aliases:
  - km-tui.body-merge
  - km-tui-body-merge
created_by: claude:124bfbe5
created_at: 2026-02-14T08:13:16Z
closed_at: 2026-02-14T08:26:19Z
owner: bjorn@stabell.org
assignee: claude:124bfbe5
---

# [x] Merge all body content into one virtual card per column @km/tui #feature #P3 @claude:124bfbe5

Body content blocks (paragraphs, code, quotes) before structural children in a column should render as ONE virtual card, not separate cards. The virtual card has no title — the column header serves as its title. Currently body nodes can create multiple merged cards if non-body items are interspersed.

