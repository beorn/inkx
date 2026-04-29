---
id: "@km/tui/undo-collapse-state"
aliases:
  - km-tui.undo-collapse-state
  - km-tui-undo-collapse-state
created_by: Bjørn Stabell
created_at: 2026-03-31T21:13:25Z
closed_at: 2026-03-31T23:00:09Z
close_reason: "Already implemented: UndoEntry has
  foldStateBefore/foldStateAfter, handlers snapshot fold state, undo/redo
  restores it"
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Undo does not restore card expand/collapse state @km/tui #bug #P2 @Bjørn Stabell

After editing a card and then undoing the edit, the card's expand/collapse state changes.

Repro:
1. Navigate to a card with visible children (e.g. Horizon 4 showing 3 child items + '+5' hidden)
2. Enter edit mode (Enter)
3. Make an edit (e.g. End + Enter to create a new item)
4. Escape to exit edit mode
5. Press 'u' to undo

Expected: Card returns to its previous state with 3 visible children + '+5' hidden
Actual: Card collapses to just the title with '+5' (all children hidden)

This is a minor UX issue compared to the Tab corruption bug but affects the editing workflow.