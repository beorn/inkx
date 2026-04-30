---
id: "@km/inbox/qhbo"
aliases:
  - km-qhbo
  - "@km/_orphan/qhbo"
created_at: 2026-01-21T13:52:37Z
closed_at: 2026-01-23T15:07:49Z
---

# [x] Normalize card rendering: padding, task marks, sigil links @km/_orphan #bug #P3

Issues with card rendering in board view:

1. Cards have too much left padding - the marker should be flush with the left border
2. All markdown checkboxes (e.g., [ ], [x]) should be removed from the title and instead shown as the status icon/marker
3. All nodes with task_status should render a task mark checkbox like list items do
4. Tags/sigils should be treated as links and rendered consistently - filter out/remove the sigil link that goes to the board you're looking at (e.g., @issue on the @issue board)

Goal: Any nodes at any level (board, column, card, list item) should render all of this the same way - consistent formatting for:
- Task status markers
- Tags/mentions/projects (as clickable links)
- Clean titles without redundant checkboxes