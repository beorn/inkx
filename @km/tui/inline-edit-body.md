---
mentions:
  - km
  - claude
id: "@km/tui/inline-edit-body"
aliases:
  - km-tui.inline-edit-body
  - km-tui-inline-edit-body
created_by: claude:a5c7f7de
created_at: 2026-02-14T15:57:30Z
closed_at: 2026-02-14T21:08:15Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] TUI: zoom_inwards ('i') into body-only node causes stuck cursor at board level @km/tui #bug #P2 @claude:a5c7f7de

Steps: cursor to 'Agent Instructions', press 'i' (zoom_inwards). The node has mostly body content, so it renders as a virtual Description column. From there, 'k' skips the virtual body card and jumps to board level. At board level, h/l/k all return boundary — cursor is stuck. Only 'j' works. Root cause: virtual card skipping + board-level navigation boundary. Sub-issues: (1) zoom_inwards into nodes with only body content creates a confusing view, (2) boundary messages are generic ('Can't move up') instead of explaining why, (3) boundary messages have no timeout — cleared on next keypress.

