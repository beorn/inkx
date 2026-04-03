# Selection Model

Everything goes through `Selection.*` — one namespace, one state machine. Designed for tree/outliner today, extensible to creative tools tomorrow.

## State

```ts
type ID = string & { readonly __brand: "ID" }

type Cursor<T> = { cursor: T; anchor?: T }   // collapsed or range

type TextPoint = { nodeId: ID; offset: number; affinity?: "forward" | "backward" }

type SelectionValue = {
  node?: Cursor<ID>                // node cursor + shift-extend anchor
  text?: Cursor<TextPoint>         // text caret + text selection anchor
  ids: ReadonlySet<ID>             // selected nodes (concrete set)
} | undefined

type SelectionState = Map<string, SelectionValue>  // scopeName → value
```

Three independent pieces: `node` (where you are in the tree), `text` (where you are in text), `ids` (what's selected). Mode is derived: `!sel` = board, `node && !text` = node, `text` = text.

### Invariants (km defaults — other SelectionMachines may differ)

- `ids.size > 0` (else `undefined`)
- `node` present when `sel` exists
- `node.cursor ∈ ids`
- `node.anchor ∈ ids` (when present)
- `text.cursor.nodeId === node.cursor` (when text present)
- Node actions clear `text`. Text actions don't touch `node`/`ids`.

Enforced by every mutator — never deferred.

## Interface

Consumers only use `Selection.*` — internals are hidden.

```ts
const Selection = {
  // Read
  cursor(sel):                      ID | undefined
  anchor(sel):                      ID | undefined
  ids(sel):                         ReadonlySet<ID>
  includes(sel, nodeId):            boolean             // ids.has() — O(1)
  textCursor(sel):                  TextPoint | undefined
  textAnchor(sel):                  TextPoint | undefined
  hasSingleNode(sel):               boolean
  isEditing(sel):                   boolean
  isTextCollapsed(sel):             boolean
  inputMode(sel):                   "board" | "node" | "text"
  insertionPoint(sel, space):       InsertionPoint

  // Node mutations (clear text, preserve invariants)
  of(nodeId):                       SelectionValue      // single node
  select(nodeId):                   SelectionValue      // cursor=anchor=nodeId, ids={nodeId}
  add(sel, nodeId):                 SelectionValue      // ids ∪ {nodeId}
  remove(sel, nodeId, space):       SelectionValue      // ids \ {nodeId}, repair cursor
  toggle(sel, nodeId, space):       SelectionValue      // XOR nodeId in ids
  extend(sel, nodeId, space):       SelectionValue      // ids = space.range(anchor, nodeId)
  collapseToCursor(sel):            SelectionValue      // ids = {cursor}
  areaSelect(base, hitIds, mode, space): SelectionValue // commit against gesture-start base

  // Text mutations (don't touch node/ids)
  edit(sel, offset):                SelectionValue      // start editing at cursor node
  stopEditing(sel):                 SelectionValue      // clear text
  moveTextCursor(sel, offset):      SelectionValue
  extendTextRange(sel, offset):     SelectionValue

  // Pipeline
  normalize(sel, doc, space):       SelectionValue      // post-edit repair (stale IDs, clamped offsets)

  // TEA
  createState():                    SelectionState
  update(action, state, space):     [SelectionState, SelectionEffect[]]
}
```

### Cursor repair (internal — hidden behind mutators)

When a mutation removes cursor from ids: nearest in view order → first in ids → `undefined`.

### Anchor policy

`select`/`collapseToCursor`/`areaSelect(replace)` → reset anchor. `extend` → keep anchor. `toggle`/`remove` that remove the anchor → reset to repaired cursor. Everything else → keep.

## Layers

```
 3. Gesture overlay    transient preview during drag/shift/lasso
 2. Committed          the SelectionState in the TEA store
 1. Base               frozen snapshot at gesture start
```

No gesture active → consumers see layer 2. During a gesture → consumers see `merge(base, overlay)`. Layer 2 is untouched until commit.

- **Commit** (mouseup / shift release): merged result writes to layer 2
- **Cancel** (Escape): layers 1+3 discarded, layer 2 unchanged

```ts
// The provider merges layers transparently
function useSelection(): SelectionValue {
  const committed = store.get(scopeName)
  const gesture = activeGesture
  return gesture ? deriveEffective(gesture, space) : committed
}
```

Consumers call `Selection.cursor(sel)`, `Selection.includes(sel, id)` — they don't know which layer they're reading.

## Interactions

Every way selection changes, categorized by commit behavior.

### Instant (commit immediately)

| Trigger | Action |
|---|---|
| Click node B | `select("B")` |
| Cmd+click B | `toggle("B")` |
| Click text in B | `select("B")` + `edit(offset)` |
| Click empty | `clear` |
| Enter | `edit(0)` |
| Escape (text) | `stopEditing` |
| Escape (multi) | `collapseToCursor` |
| Escape (single) | `clear` |
| j / k | `select(next/prev)` |
| API "Select X" | `select("X")` |
| API "Also Y" | `add("Y")` |
| API "Deselect Y" | `remove("Y")` |

### Overlay (preview → commit on gesture end)

| Trigger | Overlays | Commit on |
|---|---|---|
| Shift+click / Shift+j/k | `node` + `ids` (range walk) | mouseup / shift release |
| Drag lasso | `ids` (hit-test, replace) | mouseup |
| Cmd+drag lasso | `ids` (hit-test, XOR) | mouseup |
| Click+drag in text | `text` (drag-select) | mouseup |
| Shift+arrow in text | `text` (extend range) | shift release |

### Visual only (no selection change)

| Trigger | Visual |
|---|---|
| Drag selected nodes | drop indicator |
| Hover | hover highlight |

### Gesture session types

```ts
type GestureSession = { base: SelectionValue }

type AreaSelectSession   = GestureSession & { kind: "areaSelect"; hitIds: ReadonlySet<ID>; mode: "replace" | "xor" }
type TextSelectSession   = GestureSession & { kind: "textSelect"; anchor: TextPoint; focus: TextPoint }
type ExtendSession       = GestureSession & { kind: "extend"; anchor: ID; focus: ID }
type DragSession         = { kind: "drag"; dragging: ReadonlySet<ID>; dropTarget: NodeDropTarget | null; dropEffect: "move" | "copy" | "link" }
```

## Example Flow

Tree: siblings `A B C D E F` under `root`.

| Step | Gesture | Result |
|---|---|---|
| 1 | Click A | `{ node: {cursor: "A"}, ids: {A} }` |
| 2 | Shift+click D | `{ node: {cursor: "D", anchor: "A"}, ids: {A,B,C,D} }` |
| 3 | Cmd+click B | `{ node: {cursor: "D", anchor: "A"}, ids: {A,C,D} }` — B removed, cursor stays |
| 4 | Cmd+click F | `{ node: {cursor: "F", anchor: "A"}, ids: {A,C,D,F} }` — F added, cursor moves |
| 5 | Enter | `{ ..., text: {cursor: {nodeId:"F", offset:0}} }` — text overlay, ids unchanged |
| 6 | Escape | text cleared, ids unchanged |
| 7 | Lasso B,C | `{ node: {cursor: "B"}, ids: {B,C} }` — replace |
| 8 | Cmd+lasso C,D,E | `{ node: {cursor: "B"}, ids: {B,D,E} }` — XOR |

## SelectionSpace

Order-dependent mutations (`extend`, cursor repair, `areaSelect` cursor choice) take a `SelectionSpace`:

```ts
interface SelectionSpace {
  has(id: ID): boolean
  compare(a: ID, b: ID): number
  range(a: ID, b: ID): ReadonlySet<ID>
  nearest(to: ID, among: Iterable<ID>): ID | null
}
```

Tree panes supply visible order. Canvas panes supply z-order. `extend()` uses view order — shift-select never includes collapsed/hidden nodes.

## Insertion Points and Drop Targets

```ts
type InsertionPoint =
  | { kind: "node"; parentId: ID; edge: "before" | "after"; referenceId: ID }
  | { kind: "text"; nodeId: ID; offset: number }

type NodeDropTarget = { kind: "node"; where: "before" | "after" | "into"; targetId: ID }
```

`Selection.insertionPoint(sel, space)` derives from cursor. Drop targets resolved by proximity (Decker pattern: enumerate candidates → nearest within threshold → filter cycles). On drop, `DropTarget` → `InsertionPoint` → document mutation.

## map() Contract (v1)

Commands provide `selectionAfter` directly. Generic mapping deferred to v2.

```ts
type TransactionMeta = {
  selectionBefore?: SelectionValue
  selectionAfter?: SelectionValue          // preferred
  selectionMapping?: SelectionMapping      // fallback
}

interface SelectionMapping {
  mapId(id: ID): ID | null
  mapTextPoint(p: TextPoint): TextPoint | null
}
```

Resolution: `selectionAfter` → `selectionMapping` → `normalize(sel, newDoc, space)`.

## SelectionProvider

Focus (silvery) and Selection (km) are orthogonal. Focus = which widget gets keystrokes. Selection = which data is selected. Active selection = `scopes[resolveSelectionOwner(focus)]`. Modals push focus scope without changing selection.

```tsx
<SelectionProvider scopeName="main-board" space={space}>
  <BoardView />
</SelectionProvider>

const sel = useSelection()                          // merged committed + overlay
const dispatch = useSelectionDispatch()              // (SelectionAction) → void
```

## Consumer Taxonomy

| Consumer | Code |
|---|---|
| Inspector | `Selection.cursor(sel)` |
| Keyboard routing | `Selection.isEditing(sel)` |
| Delete/move/copy | `Selection.ids(sel)` |
| Per-node highlight (hot path) | `Selection.includes(sel, id)` |
| Paste/Enter | `Selection.isEditing(sel) ? textOp() : nodeOp()` |
| Insert content | `Selection.insertionPoint(sel, space)` |

---

## Appendix

### What This Replaces

| Before | After |
|---|---|
| `cursorNodeId` (CursorStore) | `Selection.cursor(sel)` |
| `cursorCardNodeId` | `ancestor(Selection.cursor(sel), "card")` |
| `selectionLevel` / `editLevel` | `Selection.inputMode(sel)` |
| `multiSelected: Set<string>` | `Selection.ids(sel)` |
| `selectionAnchor` | `Selection.anchor(sel)` |
| `inlineEditBlock` | `Selection.isEditing(sel)` |
| `expandWithDescendants()` | Not Selection — operation targeting |

### Undo

Content edits carry `selectionBefore`/`selectionAfter` as transaction metadata. Undo restores both. Cursor-only moves don't create undo entries.

### Prior Art

| Feature | AppKit | SlateJS | ProseMirror | km |
|---|---|---|---|---|
| Storage | IndexSet | {anchor, focus} | abstract | **concrete Set** |
| Primary/cursor | No | No | No | **Yes** |
| Text+node | No | Yes | Yes | **Overlay** |
| Invariants | No | No | Yes | **By construction** |
| Namespace | N/A | Editor.* | N/A | **Selection.*** |

### Future

Canvas (same type, no range walk), drill-in (scope change), GridSelection (genuinely different — rectangular ranges), multiple cursors (CodeMirror 6), collaborative cursors (presence overlay).
