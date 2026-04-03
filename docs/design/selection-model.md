# Selection Model

Selection tracks the cursor, the selected set, and optionally a text caret within the cursor node. Gestures build tentative selections (`selecting`) that commit on gesture end. Everything goes through `Selection.*`.

## The Type

```ts
type ID = string & { readonly __brand: "ID" }
type TextPoint = { nodeId: ID; offset: number; affinity?: "forward" | "backward" }

type Selection = {
  nodes: readonly [ID, ...ID[]]                                  // [0]=cursor, [last]=anchor
  text?: readonly [TextPoint] | readonly [TextPoint, TextPoint]  // collapsed caret or range
}

type SelectionState = Map<string, Selection>     // scopeName → selection
```

`nodes`: ordered array of selected node IDs. `nodes[0]` is the cursor (primary item). `nodes.at(-1)` is the anchor (shift-extend origin). IDs between are also selected.

`text`: optional text position(s) within the cursor node. One `TextPoint` = collapsed caret. Two = text range (`[0]` = cursor, `[1]` = anchor). Text selection never spans nodes — if a drag crosses a node boundary, the gesture morphs to node selection.

Cursor and anchor are encoded by position, not separate fields — one fewer thing to keep in sync.

### Mode

| Condition | Mode |
|---|---|
| `selection === undefined` | board |
| `selection.text === undefined` | node |
| `selection.text !== undefined` | text |

### Core invariants

- `nodes.length > 0` (else selection is `undefined`)
- `text[0].nodeId === nodes[0]` (text belongs to cursor node)
- Node mutations clear `text`; text mutations don't touch `nodes`

Mutators enforce these inline.

## SelectionSpace

Order-dependent operations (`extend`, cursor repair, `areaSelect` cursor choice) take a `space` — the pane-supplied ordering context:

```ts
interface SelectionSpace {
  has(id: ID): boolean
  compare(a: ID, b: ID): number
  range(a: ID, b: ID): readonly ID[]       // inclusive, in view order
  nearest(to: ID, among: Iterable<ID>): ID | null
}
```

Tree panes supply visible order. Canvas panes supply z-order. `extend()` uses view order — shift-select never includes collapsed/hidden nodes.

## State Flow

| Name | Meaning | Lifetime |
|---|---|---|
| `selected` | committed selection | persistent (store) |
| `selecting` | active gesture preview | transient |
| `selection` | effective selection consumers see | computed |

Without a gesture, `selection === selected`. During a gesture, `selection` is the preview computed from `selecting` and `selected`.

```ts
const selected  = signal<Selection | undefined>()
const selecting = signal<Selecting | undefined>()
const selection = computed(() =>
  selecting.value?.effective(selected.value, space) ?? selected.value
)

// Derived from selection — consumers subscribe to what they need
const cursor    = computed(() => Selection.cursor(selection.value))
const ids       = computed(() => Selection.ids(selection.value))
const isEditing = computed(() => Selection.isEditing(selection.value))
const inputMode = computed(() => Selection.inputMode(selection.value))
```

```
  gestures ──► selected  (source)  ──┐
  gestures ──► selecting (source)  ──┤
                                     ▼
                                  selection (computed)
                                     │
                    ┌────────┬───────┼────────┬──────────┐
                    ▼        ▼       ▼        ▼          ▼
                 cursor    ids   isEditing  inputMode  insertionPoint
```

Commit (mouseup / shift release) writes `selecting.effective()` to `selected`. Cancel (Escape) clears `selecting`.

## Public API (`Selection.*`)

Outside the selection module, code uses these helpers rather than reading fields directly. The `Selection` namespace (distinct from the `Selection` type) is the public interface.

```ts
const Selection = {
  // Read
  cursor(sel):          ID | undefined
  anchor(sel):          ID | undefined
  ids(sel):             ReadonlySet<ID>       // cached Set from nodes array
  includes(sel, id):    boolean               // O(1)
  textCursor(sel):      TextPoint | undefined
  textAnchor(sel):      TextPoint | undefined
  isEditing(sel):       boolean
  inputMode(sel):       "board" | "node" | "text"
  insertionPoint(sel, space): InsertionPoint

  // Node mutations (clear text, enforce invariants)
  select(id):                    Selection     // nodes = [id]
  add(sel, id):                  Selection     // prepend (becomes cursor)
  remove(sel, id, space):        Selection     // remove, repair cursor/anchor
  toggle(sel, id, space):        Selection     // add or remove
  extend(sel, id, space):        Selection     // nodes = [id, ...range, anchor]
  collapseToCursor(sel):         Selection     // nodes = [cursor]
  areaSelect(sel, hitIds, mode, space): Selection
  clear():                       undefined

  // Text mutations (don't touch nodes)
  edit(sel, offset):             Selection     // set text at cursor node
  stopEditing(sel):              Selection     // clear text
  moveTextCursor(sel, offset):   Selection
  extendTextRange(sel, offset):  Selection

  // Post-edit repair
  normalize(sel, doc, space):    Selection
}
```

Mutations accept `ID | TextPoint | Selection` as target (resolves to node ID automatically).

## Interactions

| Type | Trigger | Action | Commit | Cancel |
|---|---|---|---|---|
| `node-select` | click / j / k | `select(id)` | immediate | — |
| `node-select-toggle` | cmd+click | `toggle(id)` | immediate | — |
| `node-areaselect` | drag lasso | `areaSelect(hits, "replace")` | mouseup | Escape |
| `node-areaselect-toggle` | cmd+drag lasso | `areaSelect(hits, "xor")` | mouseup | Escape |
| `node-shiftselect` | shift+click / shift+j/k | `extend(id)` | shift release | Escape |
| `text-cursor` | click text / double-click | `select(id)` + `edit(offset)` | immediate | — |
| `text-dragselect` | click+drag in text | `extendTextRange` | mouseup | Escape |
| `text-shiftselect` | shift+arrow in text | `extendTextRange` | shift release | Escape |
| `enter-text` | Enter | `edit(0)` | immediate | — |
| `exit` | Escape (text mode) | `stopEditing` → node mode | immediate | — |
| `exit` | Escape (multi-select) | `collapseToCursor` → single node | immediate | — |
| `exit` | Escape (single node) | `clear` → board mode | immediate | — |
| `drag-drop` | drag selected node | move all selected | drop | Escape |
| `drag-drop` | drag unselected node | `select(id)` + move | drop | Escape |

Non-immediate gestures preview via `selecting` until committed. Cancel discards.

Gestures can morph mid-drag: `text-dragselect` crossing a node boundary becomes `node-areaselect`. Drag back reverts. Only the final state at gesture end commits.

## Example

Stored order is `[cursor, ...selected, anchor]`, not visual order.

| # | Gesture | nodes | text |
|---|---|---|---|
| 1 | Click A | `[A]` | — |
| 2 | Shift-click D | `[D, B, C, A]` | — |
| 3 | Cmd-click B (off) | `[D, C, A]` | — |
| 4 | Cmd-click F (on) | `[F, D, C, A]` | — |
| 5 | Enter | `[F, D, C, A]` | `[{F,0}]` |
| 6 | Escape | `[F, D, C, A]` | — |
| 7 | Lasso B,C | `[B, C]` | — |
| 8 | Cmd-lasso C,D,E | `[B, D, E]` | — |

## Drop Targets

```ts
type InsertionPoint =
  | { kind: "node"; parentId: ID; edge: "before" | "after"; referenceId: ID }
  | { kind: "text"; nodeId: ID; offset: number }

type DropTarget = { where: "before" | "after" | "into"; targetId: ID }
```

`Selection.insertionPoint()` derives from cursor. During drag, the UI computes a `DropTarget` from pointer proximity. On drop, target converts to `InsertionPoint`, which drives the document mutation.

## Integration

**Scopes**: `SelectionState = Map<string, Selection>`. One scope per pane. Scope lifecycle via `Map.set()` / `Map.delete()`.

**Focus**: Keyboard focus (silvery) is orthogonal to selection. Focus determines the active scope, but focus changes don't rewrite selection. Modals push a focus scope without changing selection.

**Remapping**: Selection remapping is explicit in v1 — transactions carry `selectedBefore` / `selectedAfter`. A general position-mapping layer is deferred.

**Undo**: Transactions carry selection snapshots. Cursor-only moves don't create undo entries.

```tsx
<SelectionProvider scopeName="board" space={space}>
  <BoardView />
</SelectionProvider>
```

---

## Appendix

### Gesture sessions

```ts
type Selecting =
  | AreaSelectSession
  | NodeExtendSession
  | TextDragSession
  | TextExtendSession

type AreaSelectSession  = { kind: "node-areaselect"; hitIds: readonly ID[]; mode: "replace"|"xor"; effective(sel, space): Selection }
type NodeExtendSession  = { kind: "node-shiftselect"; anchor: ID; focus: ID; effective(sel, space): Selection }
type TextDragSession    = { kind: "text-dragselect"; anchor: TextPoint; focus: TextPoint; effective(sel, space): Selection }
type TextExtendSession  = { kind: "text-shiftselect"; anchor: TextPoint; focus: TextPoint; effective(sel, space): Selection }
type DragDropSession    = { kind: "drag"; dragging: readonly ID[]; dropTarget: DropTarget|null; dropEffect: "move"|"copy"|"link" }
```

### What this replaces

| Before | After |
|---|---|
| `cursorNodeId` | `Selection.cursor(sel)` |
| `multiSelected` | `Selection.ids(sel)` |
| `selectionAnchor` | `Selection.anchor(sel)` |
| `inlineEditBlock` | `Selection.isEditing(sel)` |
| `selectionLevel` | `Selection.inputMode(sel)` |

### Prior art

AppKit (IndexSet), SlateJS ({anchor, focus}), ProseMirror (abstract). km: ordered array, text overlay, signal DAG, `Selection.*` namespace.

### Future

Canvas (same type, no range walk), drill-in (scope push), GridSelection (rectangular ranges), multiple cursors, collaborative presence.
