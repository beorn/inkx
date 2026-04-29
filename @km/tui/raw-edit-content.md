---
id: "@km/tui/raw-edit-content"
aliases:
  - km-tui.raw-edit-content
  - km-tui-raw-edit-content
created_by: claude:5770ce77
created_at: 2026-02-17T10:57:20Z
closed_at: 2026-02-17T11:05:04Z
owner: bjorn@stabell.org
assignee: claude:5770ce77
---

# [x] Show full raw markdown (metadata, @tags, color=) when editing @km/tui #feature #P2 @claude:5770ce77

When entering edit mode, compose the edit text with all metadata from node fields (due dates, priority, @tags, color=, recurrence, scheduled). Currently editContent uses raw node.content which may not include metadata set via UI. Use logic similar to appendTaskMetadata() from the serializer.