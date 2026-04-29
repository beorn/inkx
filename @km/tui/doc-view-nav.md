---
id: "@km/tui/doc-view-nav"
aliases:
  - km-tui.doc-view-nav
  - km-tui-doc-view-nav
created_by: claude:ceb7c9cb
created_at: 2026-03-29T05:44:19Z
closed_at: 2026-03-29T06:24:38Z
close_reason: j/k navigates through flattened doc tree (items up to depth 3).
  flattenDocTree in view-navigation.ts matches DocContent rendering.
---

# [x] Doc view: j/k cursor navigation through nested content @km/tui #feature #P2

## Problem
In detail/doc view, j/k only navigates top-level children (Card-based cursor). 
Nested content (sub-headings, body items, tasks under sections) is visible but not navigable.

## Approach
Flatten the doc tree into a navigable node list. The cursor should walk through 
every visible item node in document order (headings, list items, tasks — skip body 
paragraphs which aren't independently selectable).

The detail pane cursor system (cursorNodeId in BoardPaneState) already works — it 
just needs the node index to include nested children, not just top-level.

## Connection to existing code
- view-navigation.ts handles cursor movement for the detail pane
- The detail pane uses a flat list of children for cursor indexing
- Need to recursively flatten item children into the cursor index