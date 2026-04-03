# Selection Model

Selection is reactive state derived from user input. Because silvery owns the UI (no DOM selection API to fight), the entire system is a signal DAG: input signals → derived gesture → effective selection → consumer reads.

## Type

```ts
type ID = string & { readonly __brand: "ID" }
type TextPoint = { nodeId: ID; offset: number; affinity?: "forward" | "backward" }

type Selection = {
  nodes: readonly [ID, ...ID[]]                                  // [0]=cursor, [last]=anchor
  text?: readonly [TextPoint] | readonly [TextPoint, TextPoint]  // collapsed caret or range
}
```

`nodes[0]` = cursor (primary), `nodes.at(-1)` = anchor (shift-extend origin). Structural positions, not separate fields.

`text` = optional caret/range within the cursor node. One point = collapsed caret. Two = range. Never spans nodes.

Mode: `!sel` = board, `!sel.text` = node, `sel.text` = text.

## Signal DAG

Three input signals. One state signal. Everything else derived.

```
  GLOBAL INPUTS                      PER-SCOPE DERIVED              CONSUMERS
  ─────────────                      ──────────────────              ─────────
  pointer (x, y, buttons) ──┐
  modifiers (shift/cmd/opt) ─┼──► selectingKind ──► selecting ─┐
  keyboard events ───────────┘    (gesture type)    (preview)  │
                                                               ├──► selection ──► cursor
                                        selected ──────────────┘    (effective)   ids
                                        (committed)                               isEditing

  GLOBAL DERIVED
  ──────────────
  pointer ──► mouseState (idle/pressed/dragging)
         ──► hoverTarget ──► hoverEffect, hoverPopup
         ──► dropTarget, dropEffect (during drag)
```

The provider receives the visible nodes in order. This is how the gesture layer knows the view's ordering — no separate `SelectionSpace` abstraction.

```ts
// Global inputs (silvery runtime)
const pointer   = signal<{ x: number; y: number; buttons: number }>()
const modifiers = signal<{ shift: boolean; cmd: boolean; opt: boolean }>()

// Global derived
const mouseState  = computed(() => !ptr.buttons ? "idle" : distance < threshold ? "pressed" : "dragging")
const hoverTarget = computed(() => nodeAt(pointer.value))
const dropEffect  = computed(() => mod.opt ? "copy" : mod.cmd ? "link" : "move")

// Per-scope state
const selected = signal<Selection | undefined>()

// Per-scope derived
const selectingKind = computed(() => /* from target + modifiers + mouseState */)
const selecting     = computed(() => /* preview from kind + pointer + selected + nodes */)
const selection     = computed(() => selecting.value ?? selected.value)
```

### Selecting kinds

Derived from `(target, modifiers, mouseState)`:

| Kind | Input | Produces | Commit |
|---|---|---|---|
| `node` | click node / j / k | `select(id)` | immediate |
| `node-toggle` | cmd+click | `toggle(id)` | immediate |
| `node-extend` | shift+click / shift+j/k | range preview | shift release |
| `node-area` | drag empty | area replace preview | mouseup |
| `node-area-toggle` | cmd+drag empty | area XOR preview | mouseup |
| `text` | click text / double-click / Enter | `edit(offset)` | immediate |
| `text-extend` | shift+arrow / shift+click in text | text range preview | shift release |
| `text-drag` | drag in text | text range preview | mouseup |
| `drop` | drag node | drop indicator | drop |

Immediate kinds write to `selected` directly. Preview kinds produce `selecting` — committed when inputs release, cancelled by Escape.

### Commit

```ts
effect(() => {
  if (prevSelecting && !selecting.value) selected.value = prevSelecting
})
```

### Gesture morphing

During drag, the kind recomputes continuously. Text-drag crossing a node boundary becomes node-area. Drag back reverts. Derived from pointer position.

## Mouse

### Target → gesture

| Mousedown target | Click | Drag |
|---|---|---|
| empty space | `clear` | `node-area` |
| unselected node | `node` select | select → `drop` |
| selected node | `node` select | `drop` (all selected) |
| cursor node | no-op | `drop` (all selected) |
| text (editing) | `text` caret | `text-drag` |
| text (other node) | select + `text` | select + `text-drag` |

### Modifiers

| Modifier | Click | Drag |
|---|---|---|
| (none) | `node` / `text` | `node-area` / `drop` |
| Cmd | `node-toggle` | `node-area-toggle` |
| Shift | `node-extend` | `node-extend` preview |
| Opt | — | `drop` (copy) |

### Drop effect

```ts
const dropEffect = computed(() => mod.opt ? "copy" : mod.cmd ? "link" : "move")
```

### Double-click

Node → select + edit. Text (editing) → select word. Container → create child.

## Keyboard

| Mode | Key | Kind | Commit |
|---|---|---|---|
| node | j / k | `node` | immediate |
| node | Shift+j/k | `node-extend` | shift release |
| node | Enter | `text` | immediate |
| node | Escape | steps up: multi → single → board |
| text | Arrow | `text` | immediate |
| text | Shift+Arrow | `text-extend` | shift release |
| text | Escape | → node mode |

Mode ladder: `text ──Esc──► node ──Esc──► board ──click/j──► node ──Enter──► text`

## Selection.*

Pure functions on `Selection` values. No ordering dependency — Selection doesn't know about view order. Consumers can also read `sel.nodes` / `sel.text` directly.

```ts
const Selection = {
  // Read
  cursor(sel):       ID | undefined
  anchor(sel):       ID | undefined
  ids(sel):          ReadonlySet<ID>
  includes(sel, id): boolean                      // O(1)
  isEditing(sel):    boolean
  inputMode(sel):    "board" | "node" | "text"

  // Node mutations (clear text, throw on invariant violation)
  select(id):                     Selection
  toggle(sel, id):                Selection | undefined
  areaSelect(sel, hitIds, mode):  Selection | undefined
  clear():                        undefined
  add(sel, id):                   Selection        // convenience
  remove(sel, id):                Selection | undefined
  collapseToCursor(sel):          Selection

  // Text mutations (don't touch nodes)
  edit(sel, offset):              Selection
  stopEditing(sel):               Selection
  moveTextCursor(sel, offset):    Selection
  extendTextRange(sel, offset):   Selection

  // Plugin
  with(store, nodes):             SelectionStore
}
```

**No `space` parameter.** `Selection.*` is pure array/set operations.

- `extend` is NOT in `Selection.*` — the gesture layer computes the range from the view's node order, then calls `areaSelect(sel, rangeIds, "replace")`
- Cursor repair on `toggle`/`remove` uses simple fallback (first remaining node). The gesture layer can upgrade to "nearest in view" if needed.

Invariants (violations throw): `nodes.length > 0`, `text[0].nodeId === nodes[0]`, node mutations clear `text`.

## Provider

The provider receives the visible nodes in order. This is how gestures derive range walks and cursor repair — the view already knows the order.

```tsx
<SelectionProvider nodes={visibleNodeIds}>
  <BoardView />
</SelectionProvider>
```

The `nodes` prop is how the provider knows the view's ordering. No separate `SelectionSpace` interface. When the view changes (collapse, filter, sort), `nodes` updates → gesture derivations recompute.

| Signal | Scope | Why |
|---|---|---|
| pointer, modifiers, mouseState | global | one mouse, one keyboard |
| hoverTarget, hoverEffect, dropTarget, dropEffect | global | one pointer, one drag |
| selected, selecting, selection | per provider | each pane owns its selection |
| nodes (visible order) | per provider | each pane has its own ordering |

### km extensions

```ts
import { Selection as Base } from "@silvery/selection"
export const Selection = { ...Base, inputMode, expandWithDescendants, insertionPoint }
```

Commands: `when` selectors on `Selection.*`. Focus: orthogonal. Undo: `selectedBefore`/`selectedAfter` on transactions.

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

---

## Appendix

### What this replaces

`cursorNodeId` → `cursor(sel)`, `multiSelected` → `ids(sel)`, `selectionAnchor` → `anchor(sel)`, `inlineEditBlock` → `isEditing(sel)`, `selectionLevel` → `inputMode(sel)`.

### km domain types

```ts
type InsertionPoint = { kind: "node"; parentId: ID; edge: "before"|"after"; referenceId: ID }
                    | { kind: "text"; nodeId: ID; offset: number }
type DropTarget = { where: "before"|"after"|"into"; targetId: ID }
```

### Future

Canvas (same type, no range), drill-in (scope push), GridSelection, multiple cursors, collaborative presence.
