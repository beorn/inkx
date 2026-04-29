---
id: "@km/tui/delete"
aliases:
  - km-tui.delete
  - km-tui-delete
created_by: claude:703e68be
created_at: 2026-02-11T15:25:32Z
closed_at: 2026-02-11T15:57:32Z
owner: bjorn@stabell.org
assignee: claude:703e68be
---

# [x] Delete node with confirmation dialog for non-empty nodes @km/tui #feature #P2 @claude:703e68be

Backspace/Delete should trigger node deletion. If the node has children or backlinks, show a confirmation dialog listing what will be deleted/broken before proceeding.