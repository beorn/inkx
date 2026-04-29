---
id: "@km/tui/jk-into-children"
aliases:
  - km-tui.jk-into-children
  - km-tui-jk-into-children
created_by: Bjørn Stabell
created_at: 2026-04-01T14:59:17Z
closed_at: 2026-04-01T15:38:20Z
close_reason: Implemented spatial J/K navigation. Flat visible-block list, pure
  index arithmetic, strict inverses. J=next visible block below, K=previous
  visible block above. Not tree traversal — pure spatial/visual.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] J/K navigates to next/previous visible block (document-order traversal) @km/tui #feature #P2 @Bjørn Stabell

J/K should move to the next/previous visible block in reading order, regardless of tree hierarchy. Like arrow keys in a text document.

Examples:
- J on 'sub2' → 'Card B' (next visible block below, even though it's a different level)
- K on 'Card B' → 'sub2' (previous visible block above)
- J on 'Card A' → 'sub1' (into the card's first visible child)
- K on 'sub1' → 'Card A' (back up to the card title)

This is NOT tree traversal (parent/child). It's visual/document-order: whatever is rendered above/below the cursor in the column.