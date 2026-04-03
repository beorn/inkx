# Selection Model

Unified selection for km — covers node selection, text editing, keyboard, mouse, voice, AI.

## Core Type

```ts
type Position = { nodeId: string; offset?: number }
type Selection = { anchor: Position; focus: Position } | null
```

- `offset` absent → node position (navigating the tree)
- `offset` present → text position (editing content)
- `anchor === focus` → cursor (collapsed)
- `anchor !== focus` → range (expanded)
- `null` → nothing selected

## Derived State (pure functions, never stored)

```
isCollapsed(sel)      = posEqual(sel.anchor, sel.focus)
isTextMode(sel)       = sel?.focus.offset !== undefined
isNodeMode(sel)       = sel !== null && sel.focus.offset === undefined
cursorNodeId(sel)     = sel?.focus.nodeId
cursorCardId(sel)     = ancestor(sel.focus.nodeId, "card")
cursorColumnId(sel)   = ancestor(sel.focus.nodeId, "column")
selectedNodeIds(sel)  = derive(sel, visibleTree) → Set<string>
inputMode(sel)        = sel === null ? "board" : isTextMode(sel) ? "text" : "node"
```

## States

| State | Selection value | Visual |
|---|---|---|
| Nothing selected | `null` | No highlight |
| Node cursor | `{ anchor: {A}, focus: {A} }` (no offset) | Yellow bg on node A |
| Node range | `{ anchor: {A}, focus: {B} }` (no offset) | Yellow bg on A..B range |
| Text caret | `{ anchor: {A, 5}, focus: {A, 5} }` | Blinking cursor at offset 5 |
| Text range | `{ anchor: {A, 5}, focus: {A, 12} }` | Blue highlight over text 5..12 |

## Gesture → Selection Transitions

### Keyboard (node mode — no offset in current selection)

| Current | Key | New Selection | Notes |
|---|---|---|---|
| null | j | `{A₀, A₀}` | First card in first column |
| node(A) | j | `{B, B}` | Next visible node |
| node(A) | k | `{C, C}` | Previous visible node |
| node(A) | h | `{D, D}` | First card in prev column |
| node(A) | l | `{E, E}` | First card in next column |
| node(A) | Shift+j | `{A, B}` | Extend range down |
| node(A) | Shift+k | `{A, C}` | Extend range up |
| range(A,B) | Shift+j | `{A, B+1}` | Extend range further |
| range(A,B) | Shift+k | `{A, B-1}` | Shrink range |
| range(A,B) | j | `{B+1, B+1}` | Collapse range, move to next |
| range(A,B) | Escape | `{B, B}` | Collapse to focus |
| node(A) | Escape | `null` | Clear selection |
| node(A) | Enter | `{A', A', offset:0}` | Enter text edit (A' = title node) |

### Keyboard (text mode — offset present in current selection)

| Current | Key | New Selection | Notes |
|---|---|---|---|
| caret(A,5) | ArrowRight | `{A, 6}` | Move cursor right |
| caret(A,5) | ArrowLeft | `{A, 4}` | Move cursor left |
| caret(A,5) | Shift+Right | `{A,5}, {A,6}` | Extend text selection |
| textRange(A,5,12) | Shift+Right | `{A,5}, {A,13}` | Extend further |
| caret(A,5) | Escape | `{A, A}` (no offset) | Exit to node cursor |
| textRange(A,5,12) | Escape | `{A, A}` (no offset) | Exit to node cursor |
| caret(A, end) | ArrowDown | `{A', 0}` | Move to next editable node |

### Mouse (node mode)

| Current | Gesture | New Selection | Notes |
|---|---|---|---|
| any | Click node B | `{B, B}` | Collapse to clicked node |
| any | Shift+click B | `{anchor, B}` | Range from anchor to B |
| any | Click empty space | `null` | Deselect |
| any | Drag start | begin area select | Hit-test → range or multi |
| any | Click text in B | `{B', offset, B', offset}` | Enter text edit at position |

### Mouse (text mode)

| Current | Gesture | New Selection | Notes |
|---|---|---|---|
| caret(A,5) | Click text A pos 8 | `{A, 8}` | Reposition caret |
| caret(A,5) | Click text B pos 3 | `{B, 3}` | Move to different node text |
| caret(A,5) | Click node B (outside text) | `{B, B}` (no offset) | Exit text, select node |
| caret(A,5) | Drag text A 5→12 | `{A,5}, {A,12}` | Text drag selection |
| caret(A,5) | Click empty space | `null` | Deselect and exit text |

### Voice / AI / API

| Command | New Selection |
|---|---|
| "Select card X" | `{X, X}` |
| "Select from X to Y" | `{X, Y}` |
| "Edit card X" | `{X', 0, X', 0}` (with offset) |
| "Place cursor at position 5 in X" | `{X, 5}` |
| "Deselect" | `null` |

## Invariant

After every state change:

```ts
function validateSelection(sel: Selection, visibleTree: VisibleTree): Selection
```

- If `sel.anchor.nodeId` not in visibleTree → snap to nearest visible ancestor
- If `sel.focus.nodeId` not in visibleTree → snap to nearest visible ancestor
- If `sel.focus.offset > content.length` → clamp to end
- If node was deleted → `null`

This prevents: selecting hidden nodes, cursor on deleted node, offset past end of text.

## What This Replaces

| Current (scattered) | New (unified) |
|---|---|
| `cursorNodeId` in CursorStore | `sel.focus.nodeId` |
| `cursorCardNodeId` in CursorStore | `ancestor(sel.focus.nodeId, "card")` |
| `cursorColumnNodeId` in CursorStore | `ancestor(sel.focus.nodeId, "column")` |
| `selectionLevel` in CursorStore | `inputMode(sel)` |
| `multiSelected: Set<string>` in UI state | `selectedNodeIds(sel, visibleTree)` |
| `selectionAnchor` in UI state | `sel.anchor` |
| `inlineEditBlock` in UI state | `sel.focus.offset !== undefined` |
| `ReactiveNodeStore.multiSelected` signals | `selectedNodeIds(sel, visibleTree)` |
| `expandWithDescendants()` | Part of `selectedNodeIds()` derivation |

## Per-Pane

Selection lives per-pane. Each pane has its own independent Selection value. The focused pane receives input.

```ts
type PaneState = {
  selection: Selection
  rootId: string
  viewMode: "cards" | "detail" | ...
}
```

## Future Extensions

- **Discrete multi-select** (Cmd+click): Separate optional field, doesn't compose with range
- **Cross-node text selection**: anchor and focus in different nodeIds (like browser contentEditable)
- **Column selection**: Range where both positions are at column depth
- **Area select**: Mouse gesture that produces a node range via hit-testing
