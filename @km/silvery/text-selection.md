---
mentions:
  - km
  - claude
id: "@km/silvery/text-selection"
aliases:
  - km-silvery.text-selection
  - km-silvery-text-selection
created_by: claude:c9beade3
created_at: 2026-03-16T08:16:00Z
closed_at: 2026-03-17T01:49:45Z
close_reason: "Implemented: selection.ts (TEA state machine),
  selection-renderer.ts (inverse overlay), useSelection.tsx (React hook), wired
  into create-app.tsx mouse interception + OSC 52 clipboard. 23 tests pass.
  Termless OSC 52 capture added for testing."
owner: bjorn@stabell.org
assignee: claude:def7f8a1
---

# [x] App-level text selection (mouse drag, highlight, OSC 52 clipboard) @km/silvery #feature #P2 @claude:def7f8a1

Silvery should handle text selection at the app level, matching browser-quality interaction. Selection operates on the **render tree (DOM nodes)**, not screen buffer rows.

## Core principle: DOM-based selection (like the browser)

Mouse coordinates hit-test against silvery's render tree (which has layout positions from flexily), resolving to specific `<Text>` nodes. Selection walks the node tree in document order, not screen rows. This means:

- **Semantic content**: Copy produces the actual text content, not screen cells with padding/borders/ANSI
- **Wrapped text**: A long line wrapping across 3 screen rows is one node — selecting it gives the unwrapped string
- **Skip chrome**: Borders, separators, padding, box-drawing are not selectable
- **Cross-node selection**: Dragging across multiple `<Text>` nodes selects content in document order (like browser `getSelection()`)

## Components

1. **Hit-testing**: mouse (row, col) → render tree node + character offset (flexily provides layout rects)
2. **Selection model**: `{ anchor: NodePosition, head: NodePosition }` where NodePosition = node + character offset
3. **Range resolution**: walk render tree between anchor and head, collect text content from `<Text>` nodes
4. **Visual rendering**: reverse-video overlay on selected characters (per-node, respecting layout)
5. **Clipboard**: OSC 52 to write clean text to system clipboard + internal paste buffer fallback
6. **Word/line selection**: double-click = word, triple-click = line (operating on text node content, not screen cells)
7. **Scroll integration**: drag-to-edge scrolls viewport, extending selection beyond visible area
8. **View scoping**: selection within a single pane; crossing pane boundaries starts new selection

## Why not screen-row selection (tmux-style)?

Screen rows give you raw characters: padding spaces, border chars, broken words at wraps, ANSI in the buffer. DOM-based selection gives you the same experience as copying from a web page — clean semantic text. Since silvery owns the render tree and layout, we have everything needed to do this properly.

