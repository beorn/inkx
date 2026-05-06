---
mentions:
  - km
  - Bjørn
id: "@km/tui/tree-edit-nav"
aliases:
  - km-tui.tree-edit-nav
  - km-tui-tree-edit-nav
created_by: Bjørn Stabell
created_at: 2026-04-01T23:41:25Z
closed_at: 2026-04-02T19:31:58Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Edit navigation: tree traversal instead of card lookup @km/tui #task #P3 @Bjørn Stabell

Reframe from /big analysis of sub-section edit bugs.

## Problem

handleEditBlockNavigate uses col.cardNodes (view layer) for cross-node navigation.
Sub-sections aren't in cardNodes, requiring special-case detection + parent_id walking.
cardNodeId is manual state that must be propagated through every edit transition.

## Design

1. Delete cardNodeId from InlineEditBlock — already derived in Board.tsx (befc0a11)
2. Rewrite handleEditBlockNavigate to use tree traversal:
- Within-node: blocks (title + body) — already works
- Cross-node: repo.getChildren(parentId) for siblings, then parent's next sibling
- No col.cardNodes lookup needed — works at any tree depth
8. Card expansion stays derived (Board.tsx syncEdit)

## Evidence of completion

- InlineEditBlock type has no cardNodeId field
- handleEditBlockNavigate has no col.cardNodes reference
- Tests pass for card→card, card→sub-section, sub→sibling, sub→next-card, nested sub-sub

