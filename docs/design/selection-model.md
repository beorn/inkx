# Selection Model

Unified selection for km — covers node selection, text editing, keyboard, mouse, voice, AI.
Better than Apple's AppKit (which hides the anchor and has no unified text+node type).

## Core Type

```ts
type Position = { nodeId: string; offset?: number }

type Selection = {
  anchor: Position          // fixed end (set on click, stays on shift-extend)
  focus: Position           // active end (moves with shift-click/shift-arrow)
  toggled?: ReadonlySet<string>  // cmd+click additions/removals on top of range
} | null
```

- `offset` absent → node position (navigating the tree)
- `offset` present → text position (editing content)
- `anchor === focus` → cursor (collapsed)
- `anchor !== focus` → range (expanded)
- `toggled` → discrete modifications on top of range (cmd+click)
- `null` → nothing selected

## Namespace Interface

```ts
const Selection = {
  // Constructors
  none():    Selection                      // null
  node(id):  Selection                      // collapsed node cursor
  range(anchor, focus): Selection           // node range
  text(nodeId, offset): Selection           // text caret
  textRange(nodeId, anchor, focus): Selection  // text range

  // Queries (like Tree.nodes / KNode.isTask)
  nodes(sel, tree):      Iterable<KNode>    // all selected nodes in tree order
  nodeIds(sel, tree):    Set<string>        // fast set for .has() checks
  includes(sel, id, tree): boolean          // is this node selected?
  isCollapsed(sel):      boolean
  isTextMode(sel):       boolean
  focus(sel):            Position | null     // active end
  anchor(sel):           Position | null     // fixed end

  // Transforms
  collapse(sel):         Selection          // range → cursor at focus
  extend(sel, nodeId):   Selection          // move focus, keep anchor
  moveTo(sel, nodeId):   Selection          // collapse to new node
  toggle(sel, nodeId):   Selection          // cmd+click: add/remove from toggled
  enterText(sel, offset): Selection         // add offset → text mode
  exitText(sel):         Selection          // strip offset → node mode
  validate(sel, tree):   Selection          // snap to visible, clamp offsets
}
```

## Derived State (never stored, always computed)

```
isCollapsed(sel)      = posEqual(sel.anchor, sel.focus) && !sel.toggled?.size
isTextMode(sel)       = sel?.focus.offset !== undefined
isNodeMode(sel)       = sel !== null && sel.focus.offset === undefined
cursorNodeId(sel)     = sel?.focus.nodeId
cursorCardId(sel)     = ancestor(sel.focus.nodeId, "card")
cursorColumnId(sel)   = ancestor(sel.focus.nodeId, "column")
selectedNodeIds(sel)  = rangeWalk(anchor, focus, tree) XOR toggled
inputMode(sel)        = sel === null ? "board" : isTextMode(sel) ? "text" : "node"
```

## States

| State | Selection value | Visual |
|---|---|---|
| Nothing selected | `null` | No highlight |
| Node cursor | `{ anchor: {A}, focus: {A} }` | Yellow bg on node A |
| Node range | `{ anchor: {A}, focus: {D} }` | Yellow bg on A..D |
| Node range + toggle | `{ anchor: {A}, focus: {D}, toggled: {B, F} }` | A,C,D,F highlighted (B removed, F added) |
| Text caret | `{ anchor: {A, 5}, focus: {A, 5} }` | Blinking cursor at offset 5 |
| Text range | `{ anchor: {A, 5}, focus: {A, 12} }` | Blue highlight over text 5..12 |

## Gesture → Selection Transitions

### Keyboard (node mode — no offset)

| Current | Key | New Selection |
|---|---|---|
| null | j | `{A₀, A₀}` — first visible node |
| node(A) | j | `{B, B}` — next visible node |
| node(A) | k | `{C, C}` — previous visible node |
| node(A) | h | `{D, D}` — first card in prev column |
| node(A) | l | `{E, E}` — first card in next column |
| node(A) | Shift+j | `{A, B}` — start/extend range down |
| node(A) | Shift+k | `{A, C}` — start/extend range up |
| range(A,B) | Shift+j | `{A, B+1}` — extend range further |
| range(A,B) | Shift+k | `{A, B-1}` — shrink range |
| range(A,B) | j | `{B+1, B+1}` — collapse, move past focus |
| range(A,B) | Escape | `{B, B}` — collapse to focus |
| node(A) | Escape | `null` — clear |
| node(A) | Enter | `{A', A', offset:0}` — enter text edit |
| range+toggled | Shift+j | `{anchor, focus+1}` — shift RESETS toggled |

### Keyboard (text mode — offset present)

| Current | Key | New Selection |
|---|---|---|
| caret(A,5) | Right | `{A,6}, {A,6}` — move caret |
| caret(A,5) | Left | `{A,4}, {A,4}` — move caret |
| caret(A,5) | Shift+Right | `{A,5}, {A,6}` — extend text range |
| textRange(A,5,12) | Shift+Right | `{A,5}, {A,13}` — extend further |
| caret(A,5) | Escape | `{A, A}` no offset — exit to node |
| textRange(A,5,12) | Escape | `{A, A}` no offset — exit to node |
| caret(A, end) | Down | `{A', 0}` — next editable node |

### Mouse (node mode)

| Current | Gesture | New Selection |
|---|---|---|
| any | Click B | `{B, B}` — collapse to clicked |
| any | Shift+click B | `{anchor, B}` — range, clear toggled |
| any | Cmd+click B | `{anchor, focus, toggled XOR {B}}` — toggle B |
| any | Click empty | `null` — deselect |
| any | Click text in B | `{B', off}, {B', off}` — enter text edit |
| any | Drag across nodes | area-select → `{first, last}` range |

### Mouse (text mode)

| Current | Gesture | New Selection |
|---|---|---|
| caret(A,5) | Click text A@8 | `{A,8}, {A,8}` — reposition |
| caret(A,5) | Click text B@3 | `{B,3}, {B,3}` — switch node |
| caret(A,5) | Click node B | `{B, B}` no offset — exit text |
| caret(A,5) | Drag text 5→12 | `{A,5}, {A,12}` — text range |
| caret(A,5) | Click empty | `null` — deselect |

### Voice / AI / API

| Command | Selection |
|---|---|
| "Select card X" | `{X, X}` |
| "Select from X to Y" | `{X, Y}` |
| "Also select Z" | `{anchor, focus, toggled + {Z}}` |
| "Deselect Z" | `{anchor, focus, toggled + {Z}}` (toggle off) |
| "Edit card X" | `{X, 0}, {X, 0}` (with offset) |
| "Deselect" | `null` |

## Range + Toggle Composition Rules

Based on Finder/macOS behavior:

1. **Click** → collapse, clear toggled
2. **Shift+click** → range from anchor, **clear toggled** (fresh range)
3. **Cmd+click** → XOR node in toggled set, keep anchor+focus
4. **Cmd+shift+click** → extend range AND preserve toggled (power user)
5. **Escape** → collapse to focus, clear toggled

`Selection.nodeIds()` computes: range walk (anchor→focus) ⊕ toggled (symmetric difference).

This matches Finder. Shift resets discrete selections to a clean range. Cmd builds up discrete on top. Clean composition, no ambiguity.

## Invariant

After every state change:

```ts
Selection.validate(sel, visibleTree): Selection
```

- node not in visibleTree → snap to nearest visible ancestor
- offset > content.length → clamp to end
- node deleted → `null`

Prevents: selecting hidden nodes, cursor on deleted node, offset past end of text.

## What This Replaces

| Current (scattered state) | New (unified) |
|---|---|
| `cursorNodeId` in CursorStore | `Selection.focus(sel).nodeId` |
| `cursorCardNodeId` in CursorStore | `ancestor(focus, "card")` |
| `cursorColumnNodeId` in CursorStore | `ancestor(focus, "column")` |
| `selectionLevel` in CursorStore | `inputMode(sel)` |
| `multiSelected: Set<string>` in UI state | `Selection.nodeIds(sel, tree)` |
| `selectionAnchor` in UI state | `sel.anchor` |
| `inlineEditBlock` in UI state | `isTextMode(sel)` |
| `ReactiveNodeStore.multiSelected` signals | `Selection.nodeIds(sel, tree)` |
| `expandWithDescendants()` | Part of `Selection.nodeIds()` |

## Per-Pane

Selection lives per-pane. Focused pane receives input.

```ts
type PaneState = {
  selection: Selection
  rootId: string
  viewMode: "cards" | "detail" | ...
}
```

## Prior Art Comparison

| Feature | Apple AppKit | Apple SwiftUI | SlateJS | ProseMirror | km (proposed) |
|---|---|---|---|---|---|
| Selection type | IndexSet (rows) | Set\<ID\> | {anchor, focus} | abstract Selection | {anchor, focus, toggled?} |
| Anchor exposed | No (internal) | No | Yes | Yes (via $anchor) | Yes |
| Text + node unified | No (separate views) | No | Yes (Point has offset) | Yes (ResolvedPos) | Yes (offset?) |
| Discrete + range compose | Poorly (implicit) | Set only | N/A (text only) | N/A (text only) | XOR toggled set |
| Validated against doc | No | No | No | Yes | Yes (visibleTree) |
| Multi-pane | Responder chain | Binding-based | Single editor | Single editor | Per-pane data |

## Future Extensions

- **Cross-node text selection**: anchor and focus in different nodeIds (like contentEditable)
- **Multiple carets**: Array of Selections (like CodeMirror 6)
- **Column-level selection**: Range where both positions are column-depth nodes
- **Area select**: Mouse gesture → hit-test → node range
