---
id: "@km/tui/folder-detail"
aliases:
  - km-tui.folder-detail
  - km-tui-folder-detail
created_by: claude:586bad48
created_at: 2026-02-12T14:08:00Z
closed_at: 2026-02-12T14:32:44Z
---

# [x] Space shows detail view for folders (outline of contents) @km/tui #feature #P2 @claude:586bad48

Pressing Space should open the detail pane for folders, not just regular nodes. Currently Space likely does nothing or skips folders. For folders, the detail view should show an outline of the folder's contents — a nested tree/list of children, possibly with titles and types. This makes Space universally useful: any node on the board (task, note, or folder) can be previewed with Space. The outline view for folders serves as a quick drill-in preview without navigating into the folder.