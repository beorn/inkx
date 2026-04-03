# Selection Model

Selection is **where you are** and **what's selected**.
Gestures build tentative selections (`selecting`), which commit on gesture end.
Everything goes through `Selection.*`.

## The Type

```ts
type ID = string & { readonly __brand: "ID" }
type TextPoint = { nodeId: ID; offset: number; affinity?: "forward" | "backward" }

type Selection = {
  nodes: readonly [ID, ...ID[]]                                  // [0]=cursor, [last]=anchor
  text?: readonly [TextPoint] | readonly [TextPoint, TextPoint]  // collapsed or range
}

type SelectionState = Map<string, Selection>     // scopeName → selection
```

Both arrays follow the same convention: `[0]` = cursor, `[last]` = anchor, everything between = also selected/highlighted. Collapsed = single element.

Mode: `!sel` = board, `!sel.text` = node, `sel.text` = text.

No separate cursor/anchor fields anywhere. No invariants to enforce — positions are structural.

## Signal DAG

Three concepts: `selected` (committed), `selecting` (gesture), `selection` (what consumers see).

```ts
const selected  = signal<Selection | undefined>()   // committed state
const selecting = signal<Selecting | undefined>()   // active gesture (if any)
const selection = computed(() =>                     // effective — what consumers see
  selecting.value?.effective(selected.value, space) ?? selected.value
)

// Derived from selection
const cursor    = computed(() => selection.value?.nodes[0])
const ids       = computed(() => new Set(selection.value?.nodes))
const isEditing = computed(() => selection.value?.text !== undefined)
const inputMode = computed(() => !selection.value ? "board" : selection.value.text ? "text" : "node")
```

```
  gestures ──► selected  (source)  ──┐
  gestures ──► selecting (source)  ──┤
                                     ▼
                                  selection (computed = effective)
                                     │
                    ┌────────┬───────┼────────┬──────────┐
                    ▼        ▼       ▼        ▼          ▼
                 cursor    ids   isEditing  inputMode  insertionPoint
```

No gesture → `selection` = `selected`. During gesture → `selection` = `selecting.effective()`.
Commit writes to `selected`. Cancel clears `selecting`.

## Selection.*

The interface. Consumers never access fields directly.

```ts
const Selection = {
  // Read
  cursor(sel):          ID | undefined          // nodes[0]
  anchor(sel):          ID | undefined          // nodes.at(-1)
  includes(sel, id):    boolean                 // O(1) via cached Set
  textCursor(sel):      TextPoint | undefined   // text?.[0]
  textAnchor(sel):      TextPoint | undefined   // text?.at(-1)
  isEditing(sel):       boolean                 // text !== undefined
  inputMode(sel):       "board" | "node" | "text"
  insertionPoint(sel, space): InsertionPoint

  // Node mutations (clear text)
  select(id):           Selection               // nodes = [id]
  add(sel, id):         Selection               // prepend id (becomes cursor)
  remove(sel, id, space): Selection             // remove from array, repair ends
  toggle(sel, id, space): Selection             // add or remove
  extend(sel, id, space): Selection             // nodes = [id, ...range, anchor]
  collapseToCursor(sel): Selection              // nodes = [cursor]
  areaSelect(sel, hitIds, mode, space): Selection

  // Text mutations (don't touch nodes)
  edit(sel, offset):    Selection               // set text at cursor node
  stopEditing(sel):     Selection               // clear text
  moveTextCursor(sel, offset): Selection
  extendTextRange(sel, offset): Selection

  // Post-edit repair
  normalize(sel, doc, space): Selection
}
```

Mutations accept `ID | TextPoint | Selection` as target (resolves to node ID).
Node mutations always clear `text`. Text mutations never touch `nodes`.

## Interactions

| Type | Trigger | Action | Commit | Cancel |
|---|---|---|---|---|
| `node-select` | click / j / k | `select(id)` | immediate | — |
| `node-toggle` | cmd+click | `toggle(id)` | immediate | — |
| `node-areaselect` | drag lasso | `areaSelect(hits, mode)` | mouseup | Escape |
| `node-shiftselect` | shift+click / shift+j/k | `extend(id)` | shift release | Escape |
| `text-cursor` | click text / double-click | `select(id)` + `edit(offset)` | immediate | — |
| `text-dragselect` | click+drag in text | `extendTextRange` | mouseup | Escape |
| `text-shiftselect` | shift+arrow in text | `extendTextRange` | shift release | Escape |
| `enter-text` | Enter | `edit(0)` | immediate | — |
| `exit` | Escape (text mode) | `stopEditing` | immediate | — |
| `exit` | Escape (multi-select) | `collapseToCursor` | immediate | — |
| `exit` | Escape (single node) | `clear` → undefined | immediate | — |
| `drag-drop` | drag selected nodes | visual drop indicator | mouseup | Escape |

Non-immediate gestures preview the result via `selecting` until committed. Cancel discards — `selected` unchanged.

Gestures can morph mid-drag: `text-dragselect` crossing a node boundary becomes `node-areaselect`. Drag back → reverts.

## Example

Siblings `A B C D E F`.

| # | Gesture | nodes | text |
|---|---|---|---|
| 1 | Click A | `[A]` | — |
| 2 | Shift+D | `[D, B, C, A]` | — |
| 3 | Cmd+B off | `[D, C, A]` | — |
| 4 | Cmd+F on | `[F, D, C, A]` | — |
| 5 | Enter | `[F, D, C, A]` | `[{F,0}]` |
| 6 | Escape | `[F, D, C, A]` | — |
| 7 | Lasso B,C | `[B, C]` | — |
| 8 | Cmd+lasso C,D,E | `[B, D, E]` | — |

## SelectionSpace

Order-dependent ops take a space, not a raw tree:

```ts
interface SelectionSpace {
  has(id: ID): boolean
  compare(a: ID, b: ID): number
  range(a: ID, b: ID): readonly ID[]
  nearest(to: ID, among: Iterable<ID>): ID | null
}
```

Tree panes supply visible order. Canvas panes supply z-order. `extend()` uses view order — never includes hidden nodes.

## Drop Targets

```ts
type InsertionPoint =
  | { kind: "node"; parentId: ID; edge: "before" | "after"; referenceId: ID }
  | { kind: "text"; nodeId: ID; offset: number }

type DropTarget = { where: "before" | "after" | "into"; targetId: ID }
```

`Selection.insertionPoint()` derives from cursor. Drop targets by proximity during drag. On drop → insertion point → document mutation.

## Integration

**Scopes**: `Map<string, Selection>`. One per pane.

**Focus**: Orthogonal (silvery). Active scope = `resolveSelectionOwner(focus)`. Modals don't change selection.

**map()**: v1 uses `selectionAfter` on transactions. Generic mapping deferred.

**Undo**: Transactions carry `selectedBefore`/`selectedAfter`. Cursor-only moves no undo.

```tsx
<SelectionProvider scopeName="board" space={space}>
  <BoardView />
</SelectionProvider>
```

---

## Appendix

### Gesture sessions

```ts
type AreaSelectSession  = { kind: "node-areaselect"; hitIds: readonly ID[]; mode: "replace"|"xor" }
type NodeExtendSession  = { kind: "node-shiftselect"; anchor: ID; focus: ID }
type TextDragSession    = { kind: "text-dragselect"; anchor: TextPoint; focus: TextPoint }
type TextExtendSession  = { kind: "text-shiftselect"; anchor: TextPoint; focus: TextPoint }
type DragDropSession    = { kind: "drag"; dragging: readonly ID[]; dropTarget: DropTarget|null; dropEffect: "move"|"copy"|"link" }
```

### Invariants (km defaults)

- `nodes.length > 0` (else `undefined`)
- `text[0].nodeId === nodes[0]` (when text present)
- Node actions clear `text`; text actions don't touch `nodes`

### What this replaces

`cursorNodeId` → `Selection.cursor(sel)`, `multiSelected` → `Selection.includes(sel, id)`, `selectionAnchor` → `Selection.anchor(sel)`, `inlineEditBlock` → `Selection.isEditing(sel)`, `selectionLevel` → `Selection.inputMode(sel)`.

### Prior art

AppKit (IndexSet), SlateJS ({anchor, focus}), ProseMirror (abstract). km: ordered array, text overlay, `Selection.*` namespace.

### Future

Canvas (same type, no range walk), drill-in (scope push), GridSelection (rectangular ranges), multiple cursors, collaborative presence.
