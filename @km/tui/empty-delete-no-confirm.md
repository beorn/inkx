---
mentions:
  - km
  - claude
id: "@km/tui/empty-delete-no-confirm"
aliases:
  - km-tui.empty-delete-no-confirm
  - km-tui-empty-delete-no-confirm
created_by: claude:5770ce77
created_at: 2026-02-17T10:35:41Z
closed_at: 2026-02-17T10:39:25Z
owner: bjorn@stabell.org
assignee: claude:5770ce77
---

# [x] Skip delete confirmation for completely empty nodes @km/tui #feature #P3 @claude:5770ce77

When deleting a node (column or board) that is completely empty (no content, no children), skip the confirmation dialog. Empty nodes have no content worth protecting, so the confirmation is just friction.

