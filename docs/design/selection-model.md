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

```

No global selection registry. Each `SelectionProvider` holds its own signals — the scope IS the provider instance.

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

### State machine

Unlike Decker (which fights the browser's selection machinery), silvery owns selection completely — it's pure reactive state.

```
                    ┌──────────────────────────────────────────────┐
                    │                                              │
    ┌───────┐  click/j/k  ┌──────┐  Enter/click-text  ┌──────┐   │
    │ board │────────────► │ node │───────────────────► │ text │   │
    └───────┘              └──────┘ ◄──────────────────┘──────┘   │
        ▲                     │  ▲      Escape             │      │
        │ Escape              │  │                         │      │
        │ (single)            │  └─────────────────────────┘      │
        │                     │   cmd-click/shift/lasso/Escape    │
        └─────────────────────┘                                   │
                              │                                   │
                              │  gesture starts                   │
                              ▼                                   │
                         ┌───────────┐                            │
                         │ selecting │  (tentative)               │
                         └───────────┘                            │
                           │       │                              │
                     commit│       │cancel                        │
                           ▼       └──────────────────────────────┘
                     selected updated                        (restore)
```

Three modes (`board` → `node` → `text`) derived from `selection`. Escape steps up one level. Gestures enter `selecting` (tentative) which either commits or cancels.

All transitions are reactive signal updates — no DOM selection API, no `window.getSelection()`, no `selectionchange` events. The entire state machine is testable as pure functions.

## Public API (`Selection.*`)

`Selection.*` helpers for common operations. Consumers can also read `sel.nodes` / `sel.text` directly — the interface isn't a hard wall.

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

  // Node mutations (clear text, enforce invariants — throw on violation)
  select(id):                    Selection
  toggle(sel, id, space):        Selection | undefined  // may empty the set
  extend(sel, id, space):        Selection
  areaSelect(sel, hitIds, mode, space): Selection | undefined
  clear():                       undefined

  // Convenience
  add(sel, id):                  Selection     // idempotent toggle-on
  remove(sel, id, space):        Selection | undefined  // idempotent toggle-off
  collapseToCursor(sel):         Selection     // = select(cursor(sel))

  // Text mutations (don't touch nodes)
  edit(sel, offset):             Selection
  stopEditing(sel):              Selection
  moveTextCursor(sel, offset):   Selection
  extendTextRange(sel, offset):  Selection

  // Plugin
  with(store, space):            SelectionStore
  withNode(store, space):        SelectionStore
  withText(store):               SelectionStore
}
```

No `normalize` — invariant violations throw. Commands provide valid `selectedAfter` on transactions. Stale-ID repair is a future collab concern.

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

## Integration

### `@silvery/selection` package

```ts
import { Selection } from "@silvery/selection"

// Pure functions
Selection.cursor(sel)
Selection.toggle(sel, id, space)

// Plugin — provides signals + invariants + React provider
const store = Selection.with(baseStore, space)
store.selected                       // signal
store.selecting                      // signal
store.selection                      // computed
```

```tsx
<store.SelectionProvider scopeName="board">
  <BoardView />
</store.SelectionProvider>
```

### km extensions

```ts
import { Selection as Base } from "@silvery/selection"

export const Selection = {
  ...Base,
  inputMode(sel):  "board" | "node" | "text",
  expandWithDescendants(ids, tree): Set<ID>,
  insertionPoint(sel, space): InsertionPoint,     // domain concept, not in silvery core
}
```

**Commands**: `when` selectors built on `Selection.*` — replaces scattered `editLevel` checks.

**Focus**: Orthogonal. Focus determines active scope. Modals don't change selection.

**Undo**: Transactions carry `selectedBefore` / `selectedAfter`. Cursor-only moves no undo.

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

### km domain types (not in silvery core)

```ts
type InsertionPoint =
  | { kind: "node"; parentId: ID; edge: "before" | "after"; referenceId: ID }
  | { kind: "text"; nodeId: ID; offset: number }

type DropTarget = { where: "before" | "after" | "into"; targetId: ID }
```

### Target overloads (future)

Mutations could accept `ID | TextPoint | Selection` — resolves to node ID. Deferred to v2.

### Prior art

AppKit (IndexSet), SlateJS ({anchor, focus}), ProseMirror (abstract). km: ordered array, text overlay, signal DAG, `Selection.*` namespace.

### Future

Canvas (same type, no range walk), drill-in (scope push), GridSelection (rectangular ranges), multiple cursors, collaborative presence.
