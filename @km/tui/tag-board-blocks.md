---
id: "@km/tui/tag-board-blocks"
aliases:
  - km-tui.tag-board-blocks
  - km-tui-tag-board-blocks
created_by: claude:36393b5d
created_at: 2026-02-19T15:20:48Z
closed_at: 2026-02-19T16:17:15Z
owner: bjorn@stabell.org
assignee: claude:36393b5d
---

# [x] Tag board columns: body includes bare embed blocks instead of resolved subitems @km/tui #bug #P2 @claude:36393b5d

Tag board columns (e.g., #@-norway) show body indicator (···) but the body contains bare ![[^id]] embed blocks. These should either resolve to actual content or be treated as subitems, not body blocks.