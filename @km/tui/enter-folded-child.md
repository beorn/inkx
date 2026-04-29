---
id: "@km/tui/enter-folded-child"
aliases:
  - km-tui.enter-folded-child
  - km-tui-enter-folded-child
created_by: Bjørn Stabell
created_at: 2026-04-03T08:03:43Z
closed_at: 2026-04-03T08:34:13Z
close_reason: "Fixed: hasVisibleChildren and hasVisibleItemChildren now check
  ViewTree.areChildrenFolded() to detect when children are rendered as
  FoldedChildRow. Enter creates sibling instead of hidden child."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] [bug] Enter on folded node creates invisible child instead of sibling @km/tui #bug #P2 @Bjørn Stabell

When cursor is on a folded node (children hidden by depth limit), pressing Enter creates a new child at the hidden depth. The cursor jumps to the card title because the new node is invisible.

Expected: Since sub-items are not visible (folded), Enter should create a sibling AFTER the current node, not a hidden child.

Repro:
1. Navigate to a node with hidden children (shows count like '4' on right)
2. Press Enter
3. Bug: invisible child created, cursor jumps to card title
4. Expected: new sibling created below current node

Screenshots: 00.51.52 (before) and 00.51.55 (after — big empty space where invisible nodes are)