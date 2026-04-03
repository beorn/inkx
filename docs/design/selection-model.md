# Selection Model

Unified selection architecture for km — designed for tree/outliner today, extensible to creative tools tomorrow.

Everything goes through `Selection.*` — one namespace, one state machine, all centralized.

Reviewed by GPT 5.4 Pro (3x, $13.59 total), Gemini 2.5 Pro, plus /big analysis.

## Design Principles

1. **One namespace** — all selection logic lives in `Selection.*`
2. **Concrete stored state** — `nodeIds` is a Set, not derived from range algebra
3. **Node + text coexist** — text editing is an overlay, not a replacement
4. **Invariants enforced by construction** — mutators repair, don't rely on post-hoc normalize
5. **Selection ≠ operation targets** — commands decide what to affect
6. **Per-scope ownership** — selection belongs to a SelectionProvider, not a pane

## Stored State

```ts
type ID = string & { readonly __brand: "ID" }

type Range<T> = { anchor: T; focus: T }

type SelectionState = Map<string, SelectionValue>  // scopeName → selection value
// Active scope resolved externally via focus system
// Scope lifecycle: set() to create, delete() to dispose

type SelectionValue = {
  cursor: ID                     // where you "are" (inspector, keyboard, edit target)
  anchor: ID                     // shift-extend origin
  nodeIds: ReadonlySet<ID>       // the selected nodes (concrete set)
  text?: Range<TextPoint>        // present = editing text in cursor node
} | undefined
```

### Invariants (enforced by every mutator)

If `sel !== undefined`:
- `sel.nodeIds.size > 0`
- `sel.cursor ∈ sel.nodeIds`
- `sel.anchor ∈ sel.nodeIds`
- if `sel.text` exists, it targets `sel.cursor`'s node

If a mutation would break these, the mutator repairs inline (never deferred to normalize).

### Mode rule

Node actions (`select`, `add`, `remove`, `toggle`, `extend`, `collapseToCursor`, `areaSelect`, `clear`) always clear `text`. Text editing is subordinate to node gestures.

### Points

```ts
type TextPoint = {
  nodeId: ID                         // the text-bearing node
  offset: number
  affinity?: "forward" | "backward"  // line-wrap disambiguation
}
```

## SelectionSpace

Mutations that need order info (`extend`, cursor repair on `toggle`/`remove`, `areaSelect` cursor choice) take a `SelectionSpace` — not a raw tree.

```ts
interface SelectionSpace {
  has(id: ID): boolean                         // exists in current view?
  compare(a: ID, b: ID): number               // interaction order
  range(a: ID, b: ID): ReadonlySet<ID>        // visible nodes between a and b
  nearest(to: ID, among: Iterable<ID>): ID | null  // nearest in order
}
```

Tree panes supply visible/view order. Canvas panes supply hit/z-order. Non-linear spaces can leave `range()` unsupported.

This means `extend()` uses **view order** — shift-select never silently includes collapsed/hidden nodes.

## Selection.* — Complete API

```ts
const Selection = {
  // Constructors
  node(nodeId):                       SelectionValue  // cursor=anchor=nodeId, nodeIds={nodeId}
  // clear → just use undefined

  // Queries
  hasSingleNode(sel):                 boolean         // nodeIds.size === 1
  isTextCollapsed(sel):               boolean         // text?.anchor === text?.focus
  cursorId(sel):                      ID | null       // sel?.cursor
  includes(sel, nodeId):              boolean         // sel?.nodeIds.has(nodeId) ?? false
  isEditing(sel):                     boolean         // sel?.text !== undefined
  insertionPoint(sel, space):         InsertionPoint

  // Node mutations (pure — all clear text, all preserve invariants)
  select(nodeId):                     SelectionValue  // cursor=anchor=nodeId, nodeIds={nodeId}
  add(sel, nodeId):                   SelectionValue  // nodeIds ∪ {nodeId}, cursor=nodeId
  remove(sel, nodeId, space):         SelectionValue  // nodeIds \ {nodeId}, repair cursor/anchor
  toggle(sel, nodeId, space):         SelectionValue  // XOR in nodeIds, repair cursor if needed
  extend(sel, nodeId, space):         SelectionValue  // nodeIds=space.range(anchor, nodeId), cursor=nodeId
  collapseToCursor(sel):              SelectionValue  // nodeIds={cursor}, anchor=cursor
  areaSelect(base, hitIds, mode, space): SelectionValue  // commit against gesture-start baseline

  // Text mutations (do not alter nodeIds)
  edit(sel, offset):                  SelectionValue  // set text at cursor node (preserves nodeIds)
  stopEditing(sel):                   SelectionValue  // clear text
  moveTextFocus(sel, offset):         SelectionValue
  extendTextRange(sel, offset):       SelectionValue

  // Pipeline
  normalize(sel, doc, space):         SelectionValue  // stale IDs, clamped offsets (post-edit repair)
  map(sel, mapping):                  SelectionValue  // transform through document edits (v1: use selectionAfter)

  // State machine (TEA)
  createState():                      SelectionState
  update(action, state, space):       [SelectionState, SelectionEffect[]]

  // km convenience
  inputMode(sel):                     "board" | "node" | "text"
}
```

### Cursor repair rules (used by toggle, remove, areaSelect)

When a mutation removes the cursor from nodeIds:
1. If old cursor is still in nodeIds → keep it
2. Else use `space.nearest(oldCursor, nodeIds)` → nearest selected in view order
3. Else use first in nodeIds
4. If nodeIds is empty → return `undefined`

Same logic for anchor repair.

### Anchor update policy

| Action | anchor becomes |
|---|---|
| `select(id)` | `id` |
| `extend(id)` | unchanged (that's the point) |
| `add(id)` | unchanged |
| `toggle(id)` adding | unchanged |
| `toggle(id)` removing non-anchor | unchanged |
| `toggle(id)` removing the anchor | repaired cursor |
| `remove(id)` removing the anchor | repaired cursor |
| `collapseToCursor` | cursor |
| `areaSelect` replace | cursor |
| `areaSelect` xor, anchor still selected | unchanged |
| `areaSelect` xor, anchor removed | repaired cursor |

### edit() preserves node selection

Core `edit()` does NOT collapse nodeIds. It just sets the text overlay on the cursor node.

If a surface wants Keynote-style collapse, the gesture layer does:
```ts
sel = Selection.select(nodeId)   // collapse to single node
sel = Selection.edit(sel, offset) // then enter text
```

This keeps the state model information-preserving. Collapse is a gesture policy, not a state rule.

## Consumer Taxonomy

| Consumer | What it needs | Code |
|---|---|---|
| Inspector/properties | cursor node | `sel?.cursor` |
| Keyboard routing | editing text? | `sel?.text !== undefined` |
| Delete/move/copy | all selected nodes | `sel?.nodeIds` |
| Per-node highlight | is this node selected? | `sel?.nodeIds.has(id) ?? false` |
| Paste/Enter | text-first fallback | `sel?.text ? textOp() : nodeOp(sel.cursor)` |
| Insert new content | insertion point | `Selection.insertionPoint(sel, space)` |
| Scroll-to-reveal | cursor node | `sel?.cursor` |

Hot path: per-node highlight — `Set.has()` is O(1).

## Example Flow

**Setup**: Tree with siblings `A B C D E F` under `root`.

### 1. Click A

```
select("A")
→ { cursor: "A", anchor: "A", nodeIds: {A} }
```

### 2. Shift+click D

```
extend(sel, "D", space)
→ { cursor: "D", anchor: "A", nodeIds: {A,B,C,D} }
// space.range("A","D") = {A,B,C,D}
```

### 3. Cmd+click B (toggle off)

```
toggle(sel, "B", space)
→ { cursor: "A", anchor: "A", nodeIds: {A,C,D} }
// B removed. cursor was D, but toggle-off moves cursor to target's nearest → A.
```

Wait — actually Pro said: if toggle removes a non-cursor node, cursor stays. If it removes the cursor, repair. B is not the cursor (D is), so cursor stays at D:

```
toggle(sel, "B", space)
→ { cursor: "D", anchor: "A", nodeIds: {A,C,D} }
// B removed. cursor stays at D (B wasn't cursor).
```

### 4. Cmd+click F (toggle on)

```
toggle(sel, "F", space)
→ { cursor: "F", anchor: "A", nodeIds: {A,C,D,F} }
// F added. cursor moves to F (last interacted).
```

### 5. Enter (edit text at cursor)

```
edit(sel, 0)
→ { cursor: "F", anchor: "A", nodeIds: {A,C,D,F},
    text: { anchor: {nodeId: "F", offset: 0}, focus: {nodeId: "F", offset: 0} } }
// text set. node selection preserved.
```

### 6. Escape

```
stopEditing(sel)
→ { cursor: "F", anchor: "A", nodeIds: {A,C,D,F} }
// text cleared. nodes unchanged.
```

### 7. Area select (replace)

```
areaSelect(sel, {B,C}, "replace", space)
→ { cursor: "B", anchor: "B", nodeIds: {B,C} }
```

### 8. Cmd+drag area (XOR)

```
areaSelect(sel, {C,D,E}, "xor", space)
→ { cursor: "B", anchor: "B", nodeIds: {B,D,E} }
// C removed, D+E added. cursor stays (still selected).
```

## Actions

```ts
type SelectionAction =
  // Node (all clear text)
  | { type: "select"; nodeId }
  | { type: "add"; nodeId }
  | { type: "remove"; nodeId }
  | { type: "toggle"; nodeId }
  | { type: "extend"; nodeId }
  | { type: "collapseToCursor" }
  | { type: "clear" }                          // → undefined
  // Text (don't touch nodeIds)
  | { type: "edit"; offset }                   // edit at cursor node
  | { type: "stopEditing" }
  | { type: "moveTextFocus"; offset }
  | { type: "extendTextRange"; offset }
  // Area (clears text)
  | { type: "areaSelect"; nodeIds; mode: "replace" | "xor" }
  // Scope
  | { type: "ensureScope"; scopeName }
  | { type: "disposeScope"; scopeName }

type SelectionEffect =
  | { type: "render" }
  | { type: "scrollToCursor" }
```

## map() Contract

v1: Use `selectionAfter` on transactions. Commands that know the intended result provide it directly.

```ts
type TransactionMeta = {
  selectionBefore?: SelectionValue
  selectionAfter?: SelectionValue    // preferred — command knows best
  selectionMapping?: SelectionMapping // generic fallback
}

interface SelectionMapping {
  mapId(id: ID): ID | null
  mapTextPoint(p: TextPoint): TextPoint | null
}
```

Resolution order:
1. `selectionAfter` → use directly
2. `selectionMapping` → map current selection
3. Neither → `normalize(sel, newDoc, space)`

`Selection.map(sel, unknown)` is NOT in v1 API. It becomes `Selection.applyMapping(sel, mapping)` when needed.

## normalize

Only for post-edit repair (stale IDs, clamped offsets). NOT for invariant repair — mutators handle that.

- Remove nodeIds that no longer exist in doc
- Clamp text offsets
- Repair cursor/anchor if their targets were deleted
- If nodeIds becomes empty → `undefined`

## Gesture → Action Mapping

### Keyboard (node mode)

| Key | Action |
|---|---|
| j | `select(nextVisible)` |
| Shift+j | `extend(nextVisible)` |
| Escape (multi) | `collapseToCursor` |
| Escape (single) | `clear` |
| Enter | `edit(0)` |

### Keyboard (text mode)

| Key | Action |
|---|---|
| ArrowRight | `moveTextFocus(+1)` |
| Shift+Right | `extendTextRange(+1)` |
| Escape | `stopEditing` |

### Mouse

| Gesture | Action |
|---|---|
| Click node B | `select("B")` |
| Shift+click B | `extend("B")` |
| Cmd+click B | `toggle("B")` |
| Click text in B | `select("B")` then `edit(offset)` |
| Click empty | `clear` |
| Drag lasso | `areaSelect(hitIds, "replace")` |
| Cmd+drag lasso | `areaSelect(hitIds, "xor")` |

### Voice / AI / API

| Command | Action |
|---|---|
| "Select card X" | `select("X")` |
| "Also select Y" | `add("Y")` |
| "Deselect Y" | `remove("Y")` |
| "Select from X to Y" | `select("X")` then `extend("Y")` |
| "Edit card X" | `select("X")` then `edit(0)` |
| "Deselect all" | `clear` |

## Insertion Points and Drop Targets

```
SelectionValue   "what is selected"       persistent (TEA store)
InsertionPoint   "where content goes"     derived: Selection.insertionPoint(sel, space)
DropTarget       "where drag lands"       transient gesture state
```

### InsertionPoint

```ts
type InsertionPoint =
  | { kind: "node"; parentId: ID; edge: "before" | "after"; referenceId: ID }
  | { kind: "text"; nodeId: ID; offset: number }
```

### DropTarget (transient)

```ts
type NodeDropTarget = {
  kind: "node"
  where: "before" | "after" | "into"
  targetId: ID
}

type DragSession = {
  dragging: ReadonlySet<ID>
  dropTarget: NodeDropTarget | null
  dropEffect: "move" | "copy" | "link"
}

type AreaSelectSession = {
  base: SelectionValue              // snapshot at gesture start
  hitIds: ReadonlySet<ID>
  mode: "replace" | "xor"
}
```

**Resolution** (Decker pattern): enumerate candidates → proximity to pointer → filter cycles → nearest within threshold.

### Architecture

```
TEA Store (persistent)          Gesture State (transient)
─────────────────────           ─────────────────────────
SelectionState                  DragSession
  scopes: { id → SelectionValue } dragging, dropTarget, dropEffect

                                AreaSelectSession
                                  base, hitIds, mode
```

## SelectionProvider (React)

### Focus / Selection relationship

Focus (silvery) and Selection (km) are **orthogonal**:
- Focus = which pane/widget gets keystrokes
- Selection = which data nodes are chosen within a pane
- Active selection = `scopes[resolveSelectionOwner(focusManager)]`
- Modal dialogs push a focus scope but don't change selection
- `resolveSelectionOwner` maps focus scope → selection scope (not always 1:1)

```tsx
<SelectionProvider scopeName="main-board" space={space}>
  <BoardView />
</SelectionProvider>

const sel = useSelection()                    // SelectionValue
const dispatch = useSelectionDispatch()        // (SelectionAction) → void
dispatch({ type: "toggle", nodeId: "B" })
```

## What This Replaces

| Before (scattered) | After (`Selection.*`) |
|---|---|
| `cursorNodeId` in CursorStore | `sel?.cursor` |
| `cursorCardNodeId` | `ancestor(sel?.cursor, "card")` |
| `cursorColumnNodeId` | `ancestor(sel?.cursor, "column")` |
| `selectionLevel` / `editLevel` | `Selection.inputMode(sel)` |
| `multiSelected: Set<string>` | `sel?.nodeIds` |
| `selectionAnchor` | `sel?.anchor` |
| `inlineEditBlock` | `sel?.text !== undefined` |
| `expandWithDescendants()` | NOT in Selection — operation targeting |

## Undo

- Content edits carry `selectionBefore`/`selectionAfter` as transaction metadata
- Undo restores both document state and selection
- Pure cursor/selection moves do NOT create undo entries

## Prior Art

| Feature | AppKit | SlateJS | ProseMirror | km |
|---|---|---|---|---|
| Storage | IndexSet | {anchor, focus} | abstract | **concrete Set** |
| Anchor/focus | Hidden | Exposed | Exposed | **Exposed** |
| Primary/cursor | No | No | No | **Yes** |
| Text+node | No | Yes | Yes | **Overlay** |
| Membership | Stored | Stored | Stored | **Stored (Set)** |
| Validated | No | No | Yes | **Invariants by construction** |
| Namespace | N/A | Editor.* | N/A | **Selection.*** |
| TEA | No | No | No | **Yes** |

## Future Extensions

**Don't need new types**: Canvas (same Set+cursor, no range walk), drill-in (scope change), handles (scope into object internals).

**Do need new types**: GridSelection (rectangular ranges, active cell), multiple cursors, collaborative cursors (presence overlay).

**Scope stack**: push/pop for drill-in — builds on FocusManager's existing scope stack.
