---
id: "@km/tui/inline-edit-keys"
aliases:
  - km-tui.inline-edit-keys
  - km-tui-inline-edit-keys
created_at: 2026-02-06T08:17:56Z
closed_at: 2026-02-06T10:33:16Z
assignee: claude:49c1df8a
---

# [x] Inline edit: missing text cursor + backspace/delete broken @km/tui #bug #P2 @claude:49c1df8a

Two issues with inline text editing in the TUI:
1. No visible text cursor when editing
2. Backspace and Delete keys don't work

Likely related to the focus-based input routing migration — text editing keys may not be reaching useLineEdit.