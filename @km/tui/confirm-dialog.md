---
id: "@km/tui/confirm-dialog"
aliases:
  - km-tui.confirm-dialog
  - km-tui-confirm-dialog
created_by: claude:949598cc
created_at: 2026-02-12T09:52:16Z
closed_at: 2026-02-12T10:10:28Z
owner: bjorn@stabell.org
assignee: claude:949598cc
---

# [x] Generalized confirmation dialog with proper styling @km/tui #feature #P2 @claude:949598cc

Create a generalized confirmation dialog component. Requirements: background color (no bg showing through), Esc to close/cancel, padding around it, padding between elements, button-like indicators. Share code with existing dialog box. The delete confirmation dialog should use this. Del on columns/boards should work but require confirmation — with stronger warning when deleting lots of content.