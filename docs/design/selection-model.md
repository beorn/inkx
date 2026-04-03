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

## Reactive State

Everything derives from input signals. Unlike Decker (which fights the browser's selection), silvery owns it completely — pure reactive state, no DOM selection API.

### Signal DAG

```
  pointer ──────┐
  modifiers ────┼──► selecting (computed: gesture preview from input state)
  keyboard ─────┘         │
                          ├── + selected (committed)
                          ▼
                       selection (computed: effective = selecting ?? selected)
                          │
             ┌────┬───────┼────────┬──────────┐
             ▼    ▼       ▼        ▼          ▼
          cursor ids  isEditing inputMode  insertionPoint
```

```ts
// Input signals (from silvery runtime)
const pointer   = signal<{ x: number; y: number; buttons: number }>()
const modifiers = signal<{ shift: boolean; cmd: boolean; alt: boolean }>()

// State
const selected  = signal<Selection | undefined>()   // committed

// Derived gesture — what kind of selecting is happening right now?
const selecting = computed(() => {
  const ptr = pointer.value, mod = modifiers.value, sel = selected.value
  if (ptr.buttons && mod.shift)  return extendPreview(sel, nodeAt(ptr), space)
  if (ptr.buttons && mod.cmd)    return areaPreview(sel, hitTest(ptr), "xor")
  if (ptr.buttons)               return areaPreview(sel, hitTest(ptr), "replace")
  if (mod.shift)                 return extendPreview(sel, focusNode, space)  // kbd extend
  return undefined               // no gesture active
})

// Effective selection — what consumers see
const selection = computed(() => selecting.value ?? selected.value)

// Derived from selection
const cursor    = computed(() => Selection.cursor(selection.value))
const ids       = computed(() => Selection.ids(selection.value))
const isEditing = computed(() => Selection.isEditing(selection.value))
```

### Commit and cancel

When a gesture ends (button release / shift release), `selecting` naturally becomes `undefined`. An effect commits the last preview to `selected`:

```ts
effect(() => {
  if (prevSelecting && !selecting.value) {
    selected.value = prevSelecting  // commit
  }
})
```

Cancel (Escape) clears `selecting` WITHOUT committing — `selected` unchanged.

Immediate actions (click, j/k, Enter, Escape) write to `selected` directly — no gesture preview needed.

### Modes

Three modes derived from `selection`. Escape steps up one level: text → node → board.

```
    board ──click/j/k──► node ──Enter/click-text──► text
      ▲                    ▲                          │
      └── Escape(single) ──┘──── Escape(text) ────────┘
```

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

The gesture type is derived from input state — not imperative handlers:

| Input state | Derived gesture | Commit |
|---|---|---|
| click | `select(nodeAt(ptr))` | immediate |
| cmd+click | `toggle(nodeAt(ptr))` | immediate |
| shift+click / shift+j/k | `extend(target)` preview | shift release |
| drag | `areaSelect(hitTest, "replace")` preview | mouseup |
| cmd+drag | `areaSelect(hitTest, "xor")` preview | mouseup |
| click text / double-click | `select(id)` + `edit(offset)` | immediate |
| drag in text | `extendTextRange` preview | mouseup |
| shift+arrow in text | `extendTextRange` preview | shift release |
| Enter | `edit(0)` | immediate |
| Escape (text) | `stopEditing` | immediate |
| Escape (multi) | `collapseToCursor` | immediate |
| Escape (single) | `clear` | immediate |
| drag selected node | move all — visual preview | drop |
| drag unselected node | `select(id)` + move | drop |

Gestures morph automatically: text-drag crossing a node boundary becomes node-areaselect (derived from pointer position). Drag back → reverts. All reactive — no manual session management.

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

### Gesture derivation

`selecting` is computed from input state, not imperatively managed. The derived value is a `Selection` preview (same type as `selected`). No separate session types needed — the gesture IS the input state. When inputs change, the preview recomputes. When inputs release, the preview commits.

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
