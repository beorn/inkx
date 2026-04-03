# Selection Model

Selection is reactive state derived from user input. Because silvery owns the UI (no DOM selection API to fight), the entire system is a signal DAG: input signals → derived gesture → effective selection → consumer reads.

## The Type

```ts
type ID = string & { readonly __brand: "ID" }
type TextPoint = { nodeId: ID; offset: number; affinity?: "forward" | "backward" }

type Selection = {
  nodes: readonly [ID, ...ID[]]                                  // [0]=cursor, [last]=anchor
  text?: readonly [TextPoint] | readonly [TextPoint, TextPoint]  // collapsed caret or range
}
```

`nodes[0]` = cursor, `nodes.at(-1)` = anchor. Cursor and anchor are structural positions, not separate fields.

`text` = optional caret/range within the cursor node. Never spans nodes.

Mode derived: `!sel` = board, `!sel.text` = node, `sel.text` = text.

## The Signal DAG

Three input signals. One state signal. Everything else derived.

```
  INPUT SIGNALS                    DERIVED                         CONSUMERS
  ─────────────                    ───────                         ─────────
  pointer (x, y, buttons)  ─┐
  modifiers (shift/cmd/opt) ─┼──► selectingKind ──► selecting ─┐
  keyboard events ───────────┘    (what gesture?)   (preview)  │
                                                               ├──► selection ──► cursor
                                        selected ──────────────┘    (effective)   ids
                                        (committed)                               isEditing
                                                                                  inputMode
```

```ts
// Input signals (from silvery runtime)
const pointer   = signal<{ x: number; y: number; buttons: number }>()
const modifiers = signal<{ shift: boolean; cmd: boolean; opt: boolean }>()

// State (the only mutable thing)
const selected  = signal<Selection | undefined>()

// Everything below is derived ────────────────────────────────────

// 1. What kind of gesture is active?
const selectingKind = computed(() => {
  const ptr = pointer.value, mod = modifiers.value
  // See "Selecting kinds" table below
})

// 2. What would the selection look like if this gesture committed now?
const selecting = computed(() => {
  // Derived from selectingKind + pointer + selected + space
  // Returns a Selection preview, or undefined if no gesture
})

// 3. What do consumers see?
const selection = computed(() => selecting.value ?? selected.value)

// 4. Convenience derivations
const cursor    = computed(() => Selection.cursor(selection.value))
const ids       = computed(() => Selection.ids(selection.value))
const isEditing = computed(() => Selection.isEditing(selection.value))
const inputMode = computed(() => Selection.inputMode(selection.value))
```

### Selecting kinds

The gesture kind is derived from `(target, modifiers, pointerState)`:

| Kind | Derived when | Produces | Commit |
|---|---|---|---|
| `node` | click node | `select(id)` | immediate |
| `node-toggle` | cmd+click | `toggle(id)` | immediate |
| `node-extend` | shift+click / shift+j/k | `extend(id)` preview | shift release |
| `node-area` | drag empty | area replace preview | mouseup |
| `node-area-toggle` | cmd+drag empty | area XOR preview | mouseup |
| `text` | click text | `edit(offset)` | immediate |
| `text-extend` | shift+arrow / shift+click in text | text range preview | shift release |
| `text-drag` | drag in text | text range preview | mouseup |
| `drop` | drag node | drop indicator + effect | drop |

### Commit and cancel

Immediate kinds write to `selected` directly. Preview kinds produce a tentative `selecting` that commits when input releases:

```ts
effect(() => {
  if (prevSelecting && !selecting.value) {
    selected.value = prevSelecting  // gesture ended → commit
  }
})
```

Cancel (Escape) clears `selecting` without committing — `selected` unchanged.

## Mouse State Machine

Mouse state is also derived from pointer signals:

```ts
const mouseState = computed(() => {
  const ptr = pointer.value
  if (!ptr.buttons) return "idle"
  if (distance(ptr, downPoint) < threshold) return "pressed"
  return "dragging"
})

const hoverTarget  = computed(() => nodeAt(pointer.value))          // what's under the pointer
const hoverEffect  = computed(() => deriveHoverEffect(hoverTarget, selection))  // highlight, tooltip, etc.
const hoverPopup   = computed(() => shouldShowPopup(hoverTarget, hoverDelay))   // derived from hover duration
```

```
idle ──mousedown──► pressed ──moved beyond threshold──► dragging ──mouseup──► commit
  ▲                    │                                    │
  │                    │ mouseup (no drag = click)          │ Escape
  │                    ▼                                    ▼
  └──────────────── immediate action                     cancel
```

All derived — `mouseState`, `hoverTarget`, `hoverEffect`, `hoverPopup` are computed signals.

### What's under the pointer determines the gesture

| Mousedown target | Click (no drag) | Drag |
|---|---|---|
| empty space | `clear` | `node-area` lasso |
| unselected node | `node` select | `select(id)` → `drop` move |
| selected node | `node` select | `drop` move all |
| cursor node | no-op | `drop` move all |
| text (editing) | `text` position caret | `text-drag` select |
| text (other node) | `node` select + `text` edit | `text-drag` select |

### Modifier keys transform the gesture

| Modifier | Click becomes | Drag becomes |
|---|---|---|
| (none) | `node` / `text` | `node-area` / `drop` |
| Cmd | `node-toggle` | `node-area-toggle` |
| Shift | `node-extend` | `node-extend` (continuous preview) |
| Opt | — | `drop` with effect=copy |

### Gesture morphing

During drag, the kind recomputes continuously from pointer position:

```
text-drag ◄─────────────────────────────► node-area
            pointer leaves cursor node      pointer returns to cursor node text
```

No explicit mode switching. The computed signal re-derives the kind from current pointer position.

### Drop effect

The `drop` kind has a sub-signal for the operation type:

```ts
const dropEffect = computed(() => {
  if (modifiers.value.opt) return "copy"
  if (modifiers.value.cmd) return "link"
  return "move"  // app can override per source/target
})
```

Changes reactively mid-drag as user presses/releases modifier keys.

## Keyboard State Machine

### Node mode

| Key | Kind | Commit |
|---|---|---|
| j / k | `node` | immediate |
| Shift+j/k | `node-extend` | shift release |
| Enter | `text` | immediate |
| Escape (multi) | — | immediate (`collapseToCursor`) |
| Escape (single) | — | immediate (`clear`) |

### Text mode

| Key | Kind | Commit |
|---|---|---|
| Arrow keys | `text` | immediate |
| Shift+Arrow | `text-extend` | shift release |
| Escape | — | immediate (`stopEditing`) |

### Double-click

| Target | Action |
|---|---|
| Node | `select(id)` + `edit(0)` |
| Text (editing) | select word (text engine) |
| Column | create child (dispatch) |

### Mode ladder

Escape always steps up one level:

```
text ──Escape──► node ──Escape──► board
                  ▲                  │
                  └── click/j/k ─────┘
```

## SelectionSpace

Order-dependent operations take a `space`:

```ts
interface SelectionSpace {
  has(id: ID): boolean
  compare(a: ID, b: ID): number
  range(a: ID, b: ID): readonly ID[]
  nearest(to: ID, among: Iterable<ID>): ID | null
}
```

Tree panes supply visible order. Canvas panes supply z-order. `extend()` uses view order — shift-select never includes hidden nodes.

## Selection.*

Helpers for common operations. `sel.nodes` / `sel.text` also readable directly.

```ts
const Selection = {
  // Read
  cursor(sel):       ID | undefined
  anchor(sel):       ID | undefined
  ids(sel):          ReadonlySet<ID>
  includes(sel, id): boolean                // O(1)
  isEditing(sel):    boolean
  inputMode(sel):    "board" | "node" | "text"

  // Node mutations (clear text, throw on invariant violation)
  select(id):                     Selection
  toggle(sel, id, space):         Selection | undefined
  extend(sel, id, space):         Selection
  areaSelect(sel, hitIds, mode, space): Selection | undefined
  clear():                        undefined
  add(sel, id):                   Selection           // convenience
  remove(sel, id, space):         Selection | undefined
  collapseToCursor(sel):          Selection

  // Text mutations (don't touch nodes)
  edit(sel, offset):              Selection
  stopEditing(sel):               Selection
  moveTextCursor(sel, offset):    Selection
  extendTextRange(sel, offset):   Selection

  // Plugin
  with(store, space):             SelectionStore
}
```

### Invariants (enforced by mutators — violations throw)

- `nodes.length > 0` (else `undefined`)
- `text[0].nodeId === nodes[0]`
- Node mutations clear `text`; text mutations don't touch `nodes`

## Example

Stored order: `[cursor, ...selected, anchor]`.

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

### `@silvery/selection`

```ts
import { Selection } from "@silvery/selection"

const store = Selection.with(baseStore, space)
store.selected    // signal
store.selecting   // computed (gesture preview)
store.selection   // computed (effective)
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
  inputMode(sel),
  expandWithDescendants(ids, tree),
  insertionPoint(sel, space),
}
```

**Commands**: `when` selectors on `Selection.*`. **Focus**: orthogonal. **Undo**: `selectedBefore`/`selectedAfter` on transactions.

---

## Appendix

### What this replaces

| Before | After |
|---|---|
| `cursorNodeId` | `Selection.cursor(sel)` |
| `multiSelected` | `Selection.ids(sel)` |
| `selectionAnchor` | `Selection.anchor(sel)` |
| `inlineEditBlock` | `Selection.isEditing(sel)` |
| `selectionLevel` | `Selection.inputMode(sel)` |

### km domain types

```ts
type InsertionPoint =
  | { kind: "node"; parentId: ID; edge: "before" | "after"; referenceId: ID }
  | { kind: "text"; nodeId: ID; offset: number }
type DropTarget = { where: "before" | "after" | "into"; targetId: ID }
```

### Future

Canvas (same type, no range walk), drill-in (scope push), GridSelection (rectangular ranges), multiple cursors, collaborative presence.
