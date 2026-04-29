---
id: "@km/tui/selection-abstraction"
aliases:
  - km-tui.selection-abstraction
  - km-tui-selection-abstraction
created_by: claude:703e68be
created_at: 2026-02-11T13:23:27Z
closed_at: 2026-02-19T16:17:19Z
---

# [x] Selection model: abstract text selection and node selection into unified anchor/focus pattern @km/tui #task #P3 @claude:5f0aee02

Unify selection into a SlateJS-inspired anchor/focus model:

## Current State
- `selectionAnchor: { nodeId, sub }` + `multiSelected: Set<SelectionKey>` — redundant
- `multiSelected` is derived from anchor + cursor position in `updateSelectionRange`
- Text editing (inline edit) is separate from structural selection

## Target Model
```typescript
type Point = { nodeId: string; offset?: number }
type Selection = { anchor: Point; focus: Point } | null
```

- **anchor**: where selection started (fixed until new selection begins)
- **focus**: where cursor is now (moves with j/k/h/l navigation)
- **multiSelected**: computed/derived from walking tree between anchor and focus
- **offset**: optional, for text editing within a node (inline edit mode)

## Key Insights
- Like text editors: selection = range between two points, derived by walking the structure
- Like SlateJS: `Selection = { anchor: Point, focus: Point }`, operations (transforms) are separate
- Shift-j/k: focus moves vertically, selection = cards between anchor and focus
- Shift-h/l: focus moves to different column, selection = all cards in column range
- Normal navigation without shift: collapses selection (anchor = focus = cursor)
- Inline edit: same Point type with offset for character position

## References
- SlateJS Selection model: https://docs.slatejs.org/concepts/03-locations
- Decker removeNesting(): ensures flat selection at each tree depth level