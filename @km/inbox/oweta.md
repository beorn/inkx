---
id: "@km/_orphan/oweta"
aliases:
  - km-oweta
created_by: claude:124bfbe5
created_at: 2026-02-12T17:08:04Z
closed_at: 2026-02-12T19:45:41Z
owner: bjorn@stabell.org
assignee: claude:124bfbe5
---

# [x] TUI: Z (unfold all) collapses column instead of unfolding cards @km/_orphan #bug #P3 @claude:124bfbe5

After folding a card with zc chord, pressing Z (unfold all) should remove card IDs from foldedNodes. Instead, the column shows [collapsed] state, suggesting Z triggers TOGGLE_COLLAPSE or the UNFOLD_LEVEL handler fails to restore fold state. The card's children remain hidden after Z. Test: apps/@km/tui/tests/fold-all-corruption.test.ts. Root: UNFOLD_LEVEL handler in apps/@km/tui/src/board/board-actions.ts:248-254 or Z keybinding resolution.