---
id: "@km/tui/task-icon-colors"
aliases:
  - km-tui.task-icon-colors
  - km-tui-task-icon-colors
created_by: Bjørn Stabell
created_at: 2026-04-06T20:42:28Z
---

# [ ] [bug] WIP and Blocked status icons lose semantic colors @km/tui #bug #P2

wip and blocked icons render as plain default fg instead of orange and red. Outer Text wrapping in TreeNode.tsx:636 overrides the inner color from CheckboxIcon.tsx:132.