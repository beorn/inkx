---
id: "@km/tui/indent"
aliases:
  - km-tui.indent
  - km-tui-indent
created_by: claude:949598cc
created_at: 2026-02-12T06:56:45Z
closed_at: 2026-02-12T07:01:08Z
owner: bjorn@stabell.org
assignee: claude:949598cc
---

# [x] Tab indent: reparent under previous sibling (not visual shift_right) @km/tui #task #P2 @claude:949598cc

Tab currently maps to shift_right which does visual column movement (handleShiftCard). It should do structural indent: reparent node under its previous sibling (like Decker). Shift+Tab already does structural outdent correctly via outdentNode(). Need: 1) New indent command + handler that reparents under prev sibling, 2) Rewire Tab binding from shift_right to indent.