---
id: "@km/tui/inline-edit"
aliases:
  - km-tui.inline-edit
  - km-tui-inline-edit
created_at: 2026-02-05T12:52:43Z
closed_at: 2026-02-05T15:29:26Z
assignee: claude:49c1df8a
---

# [x] Inline node editing in TUI (text mode) @km/tui #feature #P2 @claude:49c1df8a

Add a 'text mode' to the TUI where Enter on a selected node switches to inline text editing. Both Escape and Enter exit back to 'node mode' and save. Ctrl+Z undoes the edit. Arrow keys up/down out of the current block move to the adjacent block, maintaining horizontal cursor position (curswantX). Follows the dual-mode pattern from Decker's Boardliner.

Key changes:
- Enter (normal) → enter inline edit (was open_detail_pane)
- z → open_detail_pane (takes Enter's old behavior)  
- f → fold_all (moved from z)
- New InlineEditField component using useLineEdit
- Cross-block navigation with curswantX
- section nodes edit title, task/paragraph edit content