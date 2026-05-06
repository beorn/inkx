---
mentions:
  - km
  - claude
id: "@km/tui/done-style"
aliases:
  - km-tui.done-style
  - km-tui-done-style
created_by: claude:5f0aee02
created_at: 2026-02-18T10:09:28Z
closed_at: 2026-02-18T10:19:09Z
owner: bjorn@stabell.org
assignee: claude:5f0aee02
---

# [x] Completed tasks: date badge not dimmed, colors not fully stripped @km/tui #bug #P2 @claude:5f0aee02

UPDATED: Hide date badge entirely for done/dropped tasks (saves space, not relevant). Also fixed: dimColor was missing on date badge <Text> in TreeNode.tsx:679 (date badge showed bright white instead of dim). Fix: added !style.isDoneOrDropped to rendering condition + dimColor={style.shouldDim} as fallback.

