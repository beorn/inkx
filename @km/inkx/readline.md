---
id: "@km/inkx/readline"
aliases:
  - km-inkx.readline
  - km-inkx-readline
created_at: 2026-02-04T14:10:57Z
closed_at: 2026-02-04T14:23:16Z
assignee: claude:44a381e0
---

# [x] Complete readline implementation with components @km/inkx #feature #P2 @claude:44a381e0

Create a full readline implementation in inkx with components to make text editing easy.

Features needed:
- Kill ring (yank/paste history)
- Word movement (alt-f, alt-b)
- Character transpose (ctrl-t)
- Word operations (alt-d delete word forward, alt-backspace delete word backward)
- Line operations (ctrl-u, ctrl-k, ctrl-y)
- Cursor movement (ctrl-a, ctrl-e, ctrl-f, ctrl-b)
- History navigation (optional)
- Undo/redo (optional)

Include easy-to-use components:
- <TextInput /> - basic single-line input
- <ReadlineInput /> - full readline with kill ring
- useReadline() hook for custom implementations

See @km/tui's useLineEdit hook as starting point (partial implementation).