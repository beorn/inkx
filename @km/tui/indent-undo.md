---
id: "@km/tui/indent-undo"
aliases:
  - km-tui.indent-undo
  - km-tui-indent-undo
created_by: claude:949598cc
created_at: 2026-02-12T09:29:00Z
closed_at: 2026-02-12T09:36:57Z
owner: bjorn@stabell.org
assignee: claude:949598cc
---

# [x] Undo/redo support for indent/outdent operations @km/tui #feature #P2 @claude:949598cc

Ensure undo/redo works correctly for indent/outdent operations. Each indent/outdent (including multi-select batch) should be a single undoable unit. Consider SlateJS patterns if the current undo system doesn't handle compound operations well.