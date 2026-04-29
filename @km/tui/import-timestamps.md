---
id: "@km/tui/import-timestamps"
aliases:
  - km-tui.import-timestamps
  - km-tui-import-timestamps
created_by: claude:36393b5d
created_at: 2026-02-19T13:24:53Z
closed_at: 2026-02-19T18:46:23Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Import: all items should have created/modified times @km/tui #bug #P2 @claude:8f007ba9

Imported Asana items should all have created_at and modified_at timestamps from the original Asana data. Currently some items may be missing these. Related to @km/storage/preserve-timestamps (closed) which ensured the pipeline preserves them, but the import converter may not be setting them on all nodes.