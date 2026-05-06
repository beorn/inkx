---
mentions:
  - km
  - claude
id: "@km/tui/comments-in-body"
aliases:
  - km-tui.comments-in-body
  - km-tui-comments-in-body
created_by: claude:36393b5d
created_at: 2026-02-19T15:11:23Z
closed_at: 2026-02-19T15:58:34Z
owner: bjorn@stabell.org
assignee: claude:36393b5d
---

# [x] Import: Asana comments render as body content instead of sub-items @km/tui #bug #P2 @claude:36393b5d

Asana task comments are included as '- Comments' list items in the markdown body. They show up in the detail pane body content area instead of being separate child nodes. Need to either: (a) convert comments to sub-nodes during import, or (b) filter them from body display.

