---
id: "@km/tui/cursor-path"
aliases:
  - km-tui.cursor-path
  - km-tui-cursor-path
created_by: claude:ceb7c9cb
created_at: 2026-03-24T19:24:31Z
closed_at: 2026-04-02T02:19:53Z
close_reason: deriveCursorPath via ViewNode is now the sole cursor path
  mechanism. Old parent_id walk deleted. Commit 216eadb8.
---

# [x] design: cursor path — visual hierarchy for selection and embeds @km/tui #feature #P2 @Bjørn Stabell

Replace cursorNodeId/cursorCardNodeId/cursorColumnNodeId with a single cursorPath: string[] that represents the visual hierarchy from root to cursor. Each component checks path membership for styling. Eliminates all parent_id walks for cursor context — fixes embed bugs permanently and simplifies hierarchical selection styling (yellow title, yellow border, inverse leaf).