---
id: "@km/tui/cursor-reveals-hidden"
aliases:
  - km-tui.cursor-reveals-hidden
  - km-tui-cursor-reveals-hidden
created_by: Bjørn Stabell
created_at: 2026-04-03T18:52:14Z
closed_at: 2026-04-03T19:44:35Z
close_reason: Added findVisibleAncestor() — dispatchBoard(TOGGLE_FOLD) and
  setFoldDepths() now auto-rescue cursor to nearest visible ancestor when
  folding hides it. 2 tests in fold.slow.test.ts.
---

# [x] [bug] Cursor navigates into hidden/folded nodes — should auto-expand to reveal cursor @km/tui #bug #P1 @Bjørn Stabell

When cursoring around (j/k), the cursor sometimes moves into a node that is hidden (folded/collapsed). The cursor becomes invisible — the user can't see where they are.

## Expected
When the cursor moves to a node that isn't visible (because its parent is folded), the tree should auto-expand (unfold) the necessary ancestors to make the cursor visible. The cursor should never be in an invisible state.

## Invariant
After any cursor movement: the cursor node and all its ancestors up to the board root must be visible (unfolded). If cursor lands on a node whose parent is folded, unfold that parent (and grandparent, etc.) before rendering.

## Likely fix locations
- Board reducer SELECT handler — after computing new cursorNodeId, check if it's visible
- Or: the navigation handlers (cursor_up/cursor_down) that compute the next node — they should skip hidden nodes, or auto-expand
- ViewTree/view navigation — the cursor should only land on visible nodes

## Done when
- Cursor never lands on a hidden/folded node
- If cursor would land on hidden node, ancestors auto-expand to reveal it
- Test: fold a card, navigate past it, cursor skips or reveals — never invisible