---
id: "@km/tui/indent-edit-mode"
aliases:
  - km-tui.indent-edit-mode
  - km-tui-indent-edit-mode
created_by: Bjørn Stabell
created_at: 2026-04-01T14:42:26Z
closed_at: 2026-04-01T14:47:55Z
close_reason: "Fixed: Tab/Shift+Tab now punch through the inline-edit-barrier
  wildcard in keybindings Layer 5b. Added explicit bindings before the
  catch-all. Commit 3f7adfb0."
---

# [x] Cannot indent/outdent while in text edit mode @km/tui #bug #P2 @Bjørn Stabell

Tab/Shift+Tab for indent/outdent don't work when the cursor is in inline text edit mode. Expected: indent/outdent the node while editing. Actual: nothing happens (or Tab inserts a tab character).