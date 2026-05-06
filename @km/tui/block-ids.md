---
mentions:
  - km
  - claude
id: "@km/tui/block-ids"
aliases:
  - km-tui.block-ids
  - km-tui-block-ids
created_by: claude:8f007ba9
created_at: 2026-02-20T17:15:12Z
closed_at: 2026-02-20T17:18:20Z
owner: bjorn@stabell.org
assignee: claude:8f007ba9
---

# [x] Block IDs show up in detail pane content @km/tui #bug #P2 @claude:8f007ba9

Block IDs (Asana GIDs like ^1201434868258365) show as visible text in detail pane body content when wiki links [[^id]] can't resolve targets.

Root cause: resolveNode smart resolver didn't search by block_id field. Fixed by adding block_id lookup step to smart resolver.

Also related to @km/tui/inline-ast — the inline AST refactoring will replace regex wiki link handling with proper AST resolution, making this class of bug impossible.

