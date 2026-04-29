---
id: "@km/tui/verb-grid-cmds"
aliases:
  - km-tui.verb-grid-cmds
  - km-tui-verb-grid-cmds
created_by: claude:28b14b32
created_at: 2026-02-23T02:01:02Z
---

# [ ] Implement verb grid stub commands (goto/move for tags, projects, assignees, backlinks) @km/tui #task #P3

Implement the NOOP stub commands added to the verb grid: goto_tag (g#), goto_assignee (g@), goto_project (g+), goto_backlink (g[), move_to_project (m+). Currently they return { type: 'NOOP' } and need real implementations — filter dialogs, board navigation, move operations.