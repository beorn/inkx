---
id: "@km/tui/dim-subtree"
aliases:
  - km-tui.dim-subtree
  - km-tui-dim-subtree
created_by: claude:fcaad2fa
created_at: 2026-02-18T11:55:21Z
closed_at: 2026-02-18T12:02:03Z
---

# [x] Dim body and subitems of completed/dropped tasks @km/tui #feature #P3

When a task has done/dropped status, only its title line is dimmed. Body content (blockquotes under the task) and subitems (child tasks) should also be dimmed to visually indicate the entire subtree is completed. This is different from the old dim-children bug (which dimmed ALL children of non-selected cards). Here we want to dim children only when the PARENT task is done/dropped — a semantic dim, not a selection-based dim.