---
id: "@km/tui/cursor-null-invariant"
aliases:
  - km-tui.cursor-null-invariant
  - km-tui-cursor-null-invariant
created_by: Bjørn Stabell
created_at: 2026-04-07T23:00:00Z
closed_at: 2026-04-07T23:10:51Z
close_reason: >-
  Fixed. Relaxed invariant #0 in invariants.ts to recognize sel.kind()==='idle'
  as a legitimate null-cursor state. When user deselects via empty-space click,
  sel.kind becomes 'idle', and the invariant no longer treats this as stale
  selection.


  Also added hasCursor WhenPredicate to @km/commands/when.ts (exported). NOT yet
  applied to keybindings — h/l are dual-purpose (cursor movement + pane
  switching from detail), so blanket gating breaks pane focus tests. The
  predicate is available for future selective application.


  Navigation commands already handle cursor=null gracefully (return
  boundary/no-op). The invariant fix alone prevents the InvariantViolationError.


  5715/5724 fast suite (only pre-existing symlink flake).
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Cursor-null invariant violation after deselect + gate cursor-required commands @km/tui #bug #P1 @Bjørn Stabell

Context
-------
@km/tui/column-empty-space-deselect made cursor=null a legitimate state (user clicks empty space → sel.node.select([]) → cursor=null, sel.kind='idle'). But invariants.ts:45 check #0 'cursor-not-null' still treats cursor=null on a non-empty board as a violation:

  22:51:47 ERROR silvery:app eventLoop failed: InvariantViolationError:
  Invariant violation [cursor-not-null]: Cursor is null but board has 10
  columns with real cards. Selection state may be stale. {rootId: '.'}

Any action dispatched while cursor=null (even a no-op nav) fails the post-action invariant check and throws.

Legitimate null-cursor cases listed at invariants.ts:46-48: empty board, detail pane, move mode. Intentional-deselect is now a fourth case — needs to be added.

The fix, elegantly
------------------
1) Relax invariant #0 to recognize 'intentionally deselected' via sel.kind() === 'idle'. Cursor=null is a bug only when sel.kind disagrees (selection state truly stale).

2) Add a hasCursor WhenPredicate to @km/commands/when.ts. Gate cursor-required keybindings (cursor_up/down/left/right, indent/outdent, move, zoom_in, enter_inline_edit, etc) so pressing j with cursor=null is a no-op at the keybinding layer — doesn't even dispatch the op. Uses the existing when() system — no new API surface.

3) Commands that don't need cursor (fold_all_more, unfold_all_more, filter, toggle_view_mode, etc) remain unguarded — they operate on the board as a whole.

Test (mouse-click.test.ts or new cursor-null.test.ts)
- deselect via empty-space click
- dispatch cursor_down → no-op, no throw
- dispatch fold_all_more → works, cursor still null, no throw
- click top-bar → cursor=rootId, back to normal