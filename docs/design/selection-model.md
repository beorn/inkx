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

Consumers only use `Selection.*` — internals are hidden. Helpers accept `SelectionValue` uniformly — callers don't need to check mode first.

```ts
// Target — what mutations accept (resolves to a node ID)
type Target = ID | TextPoint | SelectionValue
// ID → that node
// TextPoint → the node at textPoint.nodeId
// SelectionValue → the cursor node

const Selection = {
  // Read (work on any SelectionValue — node, text, or undefined)
  cursor(sel):                      ID | undefined
  anchor(sel):                      ID | undefined
  ids(sel):                         ReadonlySet<ID>
  includes(sel, target):            boolean             // ids.has(resolveId(target))
  textCursor(sel):                  TextPoint | undefined
  textAnchor(sel):                  TextPoint | undefined
  hasSingleNode(sel):               boolean
  isEditing(sel):                   boolean
  isTextCollapsed(sel):             boolean
  inputMode(sel):                   "board" | "node" | "text"
  insertionPoint(sel, space):       InsertionPoint

  // Node mutations (clear text, preserve invariants)
  of(target):                       SelectionValue      // single node
  select(target):                   SelectionValue      // cursor=anchor=id, ids={id}
  add(sel, target):                 SelectionValue      // ids ∪ {id}
  remove(sel, target, space):       SelectionValue      // ids \ {id}, repair cursor
  toggle(sel, target, space):       SelectionValue      // XOR id in ids
  extend(sel, target, space):       SelectionValue      // ids = space.range(anchor, id)
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

`Target` resolves to a node ID: bare ID passes through, TextPoint extracts `.nodeId`, SelectionValue extracts `.cursor`. This means a command can call `Selection.toggle(sel, otherSel, space)` — toggling whatever `otherSel` is pointing at.

### Cursor repair (internal — hidden behind mutators)

When a mutation removes cursor from ids: nearest in view order → first in ids → `undefined`.

### Anchor policy

`select`/`collapseToCursor`/`areaSelect(replace)` → reset anchor. `extend` → keep anchor. `toggle`/`remove` that remove the anchor → reset to repaired cursor. Everything else → keep.

## selection / selecting

Two concepts:

- **`selection`** — the committed state (in the TEA store)
- **`selecting`** — an active gesture in progress (transient, if any)

```ts
selection: SelectionValue               // committed

selecting?: {
  base: SelectionValue                  // snapshot of selection at gesture start
  ...gestureFields                      // hitIds, focus, mode, etc.
  effective(space): SelectionValue      // derived: base + gesture delta
}
```

No gesture active → consumers see `selection`. During a gesture → consumers see `selecting.effective(space)`. `selection` is untouched until commit.

- **Commit** (mouseup / shift release): `selecting.effective()` writes to `selection`
- **Cancel** (Escape): `selecting` discarded, `selection` unchanged

```ts
function useSelection(): SelectionValue {
  return selecting?.effective(space) ?? selection
}
```

Consumers call `Selection.cursor(sel)`, `Selection.includes(sel, id)` — they don't know whether they're seeing committed or in-progress state.

## Interactions

### Selection types

Six kinds of selection interaction. The first four are **overlays** — tentative until the gesture ends (shift released, mouse drag ended), cancellable with Escape.

| Type | Input | What changes | Overlay? |
|---|---|---|---|
| `node-areaselect` | mouse drag (lasso) | `ids` (replace or XOR) | **yes** — commit on mouseup |
| `node-shiftselect` | shift+click / shift+j/k | `node` + `ids` (range walk) | **yes** — commit on shift release |
| `text-dragselect` | click+drag in text | `text` (anchor→focus) | **yes** — commit on mouseup |
| `text-shiftselect` | shift+arrow / shift+click in text | `text` (extend range) | **yes** — commit on shift release |
| `text-cursor` | click in text / arrow keys | `text` (position caret) | no — instant |
| `node-select` | click / cmd+click / j/k / API | `node` + `ids` (replace or toggle) | no — instant |

### Instant actions (node-select, text-cursor)

| Trigger | Action |
|---|---|
| Click node B | `select("B")` |
| Cmd+click B | `toggle("B")` |
| Click text in B | `select("B")` + `edit(offset)` |
| Double-click node B | `select("B")` + `edit(0)` (enter text) |
| Double-click column | create new card (dispatch, not selection) |
| Click empty | `clear` |
| Enter | `edit(0)` |
| Escape (text) | `stopEditing` |
| Escape (multi) | `collapseToCursor` |
| Escape (single) | `clear` |
| j / k | `select(next/prev)` |
| Arrow keys (in text) | `moveTextCursor(offset)` |
| API "Select X" | `select("X")` |

### Gesture morphing

A `selecting` gesture can change type mid-gesture:

- `text-dragselect` → drag crosses node boundary → morphs to `node-areaselect`
- `node-areaselect` → drag back into single node → morphs back to `text-dragselect`

This is a `selecting` behavior, not a `selection` change — if you drag back before releasing, it reverts. Only the final state at mouseup commits. (This is how Decker's `dragMode` works: `"textselect"` ↔ `"areaselect"` transitions mid-gesture.)

### Visual only (no selection change)

| Trigger | Visual |
|---|---|
| Drag selected nodes | drop indicator |
| Hover | hover highlight |

### Gesture session types (for overlays)

```ts
type GestureSession = { base: SelectionValue }  // frozen at gesture start

type AreaSelectSession   = GestureSession & { kind: "node-areaselect"; hitIds: ReadonlySet<ID>; mode: "replace" | "xor" }
type NodeExtendSession   = GestureSession & { kind: "node-shiftselect"; anchor: ID; focus: ID }
type TextDragSession     = GestureSession & { kind: "text-dragselect"; anchor: TextPoint; focus: TextPoint }
type TextExtendSession   = GestureSession & { kind: "text-shiftselect"; anchor: TextPoint; focus: TextPoint }
type DragDropSession     = { kind: "drag"; dragging: ReadonlySet<ID>; dropTarget: NodeDropTarget | null; dropEffect: "move" | "copy" | "link" }
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
