# Selection Model

Selection is two things: **where you are** (cursor) and **what's selected** (ids).
Gestures build up a tentative selection (`selecting`), which commits to `selection` on gesture end.
Everything goes through `Selection.*`.

## The Type

```ts
type ID = string & { readonly __brand: "ID" }
type Cursor<T> = { cursor: T; anchor?: T }
type TextPoint = { nodeId: ID; offset: number; affinity?: "forward" | "backward" }

type SelectionValue = {
  node?: Cursor<ID>            // where you are in the tree (cursor + shift-extend anchor)
  text?: Cursor<TextPoint>     // where you are in text (caret + text selection anchor)
  ids: ReadonlySet<ID>         // what's selected
} | undefined
```

Mode derived from presence: `!sel` = board, `node && !text` = node, `text` = text.

## selection / selecting

```ts
selection: SelectionValue              // committed (TEA store)

selecting?: {                          // active gesture (transient)
  base: SelectionValue                 // frozen snapshot at gesture start
  effective(space): SelectionValue     // base + gesture delta
}

useSelection() = selecting?.effective(space) ?? selection
```

- No gesture → consumers see `selection`
- During gesture → consumers see `selecting.effective()`
- **Commit** (mouseup / shift release) → effective writes to `selection`
- **Cancel** (Escape) → `selecting` discarded

Consumers never know which they're seeing. They just call `Selection.cursor(sel)`.

## Selection.*

The interface. Internals hidden — consumers never access fields directly.

```ts
const Selection = {
  // Read
  cursor(sel):          ID | undefined
  anchor(sel):          ID | undefined
  ids(sel):             ReadonlySet<ID>
  includes(sel, id):    boolean               // O(1)
  isEditing(sel):       boolean
  inputMode(sel):       "board" | "node" | "text"
  insertionPoint(sel, space): InsertionPoint

  // Node mutations (clear text, enforce invariants)
  select(id):           SelectionValue        // single node
  add(sel, id):         SelectionValue
  remove(sel, id, space): SelectionValue
  toggle(sel, id, space): SelectionValue
  extend(sel, id, space): SelectionValue      // shift: range walk anchor→id
  collapseToCursor(sel):  SelectionValue
  areaSelect(base, hitIds, mode, space): SelectionValue

  // Text mutations (don't touch node/ids)
  edit(sel, offset):    SelectionValue        // start editing at cursor node
  stopEditing(sel):     SelectionValue
  moveTextCursor(sel, offset): SelectionValue
  extendTextRange(sel, offset): SelectionValue

  // Post-edit repair
  normalize(sel, doc, space): SelectionValue

  // TEA
  update(action, state, space): [SelectionState, SelectionEffect[]]
}
```

Mutations accept `ID | TextPoint | SelectionValue` as target (resolves to node ID).

Node mutations always clear `text`. Text mutations never touch `node`/`ids`.
Cursor must be in `ids` — mutators repair inline, never deferred.

## Interactions

### Instant (commit immediately)

| Trigger | Action |
|---|---|
| Click node | `select(id)` |
| Cmd+click | `toggle(id)` |
| Click text | `select(id)` + `edit(offset)` |
| Double-click | `select(id)` + `edit(0)` |
| Enter | `edit(0)` |
| Escape | `stopEditing` / `collapseToCursor` / `clear` |
| j / k | `select(next/prev)` |
| Arrow (in text) | `moveTextCursor(offset)` |

### Overlay (preview until gesture ends)

| Type | Trigger | Commit on |
|---|---|---|
| `node-areaselect` | drag lasso (replace or XOR) | mouseup |
| `node-shiftselect` | shift+click / shift+j/k | shift release |
| `text-dragselect` | click+drag in text | mouseup |
| `text-shiftselect` | shift+arrow in text | shift release |

Gestures can **morph** mid-drag: `text-dragselect` crossing a node boundary becomes `node-areaselect`. Drag back → reverts. Only final state commits.

### Visual only

Drag-drop (drop indicator), hover highlight — no selection change.

## Example

Tree: `A B C D E F` siblings.

| # | Gesture | State |
|---|---|---|
| 1 | Click A | `node:{cursor:"A"}, ids:{A}` |
| 2 | Shift+D | `node:{cursor:"D", anchor:"A"}, ids:{A,B,C,D}` |
| 3 | Cmd+B | `node:{cursor:"D", anchor:"A"}, ids:{A,C,D}` |
| 4 | Cmd+F | `node:{cursor:"F", anchor:"A"}, ids:{A,C,D,F}` |
| 5 | Enter | `..., text:{cursor:{F,0}}` — ids unchanged |
| 6 | Escape | text cleared — ids unchanged |
| 7 | Lasso B,C | `node:{cursor:"B"}, ids:{B,C}` |
| 8 | Cmd+lasso C,D,E | `node:{cursor:"B"}, ids:{B,D,E}` |

## SelectionSpace

Order-dependent ops (`extend`, cursor repair) take a space — not a raw tree:

```ts
interface SelectionSpace {
  has(id: ID): boolean
  compare(a: ID, b: ID): number
  range(a: ID, b: ID): ReadonlySet<ID>
  nearest(to: ID, among: Iterable<ID>): ID | null
}
```

Tree panes supply visible order. Canvas panes supply z-order. `extend()` uses view order — shift-select never includes hidden nodes.

## Drop Targets

```ts
type InsertionPoint =
  | { kind: "node"; parentId: ID; edge: "before" | "after"; referenceId: ID }
  | { kind: "text"; nodeId: ID; offset: number }

type DropTarget = { where: "before" | "after" | "into"; targetId: ID }
```

`Selection.insertionPoint()` derives from cursor. Drop targets resolved by proximity during drag (Decker pattern). On drop, target converts to insertion point → document mutation.

## Integration

**Scopes**: `SelectionState = Map<string, SelectionValue>`. One scope per pane.

**Focus**: Orthogonal. Focus (silvery) = which widget gets keys. Selection (km) = which data is selected. Active scope = `resolveSelectionOwner(focus)`. Modals don't change selection.

**map()**: v1 uses `selectionAfter` on transactions. Generic `SelectionMapping` deferred.

**Undo**: Transactions carry `selectionBefore`/`selectionAfter`. Cursor-only moves don't create undo entries.

```tsx
<SelectionProvider scopeName="board" space={space}>
  <BoardView />
</SelectionProvider>

const sel = useSelection()        // committed or gesture-effective
const dispatch = useSelectionDispatch()
```

---

## Appendix

### Invariants (km defaults)

- `ids.size > 0` (else `undefined`)
- `node` present when sel exists
- `node.cursor ∈ ids`, `node.anchor ∈ ids`
- `text.cursor.nodeId === node.cursor`
- Node actions clear `text`; text actions don't touch `node`/`ids`

### Gesture sessions

```ts
type GestureSession = { base: SelectionValue }
type AreaSelectSession  = GestureSession & { kind: "node-areaselect"; hitIds: ReadonlySet<ID>; mode: "replace"|"xor" }
type NodeExtendSession  = GestureSession & { kind: "node-shiftselect"; anchor: ID; focus: ID }
type TextDragSession    = GestureSession & { kind: "text-dragselect"; anchor: TextPoint; focus: TextPoint }
type TextExtendSession  = GestureSession & { kind: "text-shiftselect"; anchor: TextPoint; focus: TextPoint }
type DragDropSession    = { kind: "drag"; dragging: ReadonlySet<ID>; dropTarget: DropTarget|null; dropEffect: "move"|"copy"|"link" }
```

### What this replaces

| Before | After |
|---|---|
| `cursorNodeId` | `Selection.cursor(sel)` |
| `selectionLevel` | `Selection.inputMode(sel)` |
| `multiSelected` | `Selection.ids(sel)` |
| `selectionAnchor` | `Selection.anchor(sel)` |
| `inlineEditBlock` | `Selection.isEditing(sel)` |

### Prior art

AppKit (IndexSet, hidden anchor), SlateJS ({anchor, focus}, stored), ProseMirror (abstract, validated). km: concrete Set, explicit cursor, text overlay, invariants by construction, `Selection.*` namespace.

### Future

Canvas (same type, no range walk), drill-in (scope push), GridSelection (rectangular ranges), multiple cursors, collaborative presence.
