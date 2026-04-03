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

`text` = optional caret/range within the cursor node. One point = collapsed caret. Two = range. Text follows the same convention: `text[0]` = text cursor, `text.at(-1)` = text anchor. Never spans nodes — both endpoints target `nodes[0]`.

Mode: `!sel` = board, `!sel.text` = node, `sel.text` = text.

```ts
type PressHit =
  | { scopeId: string; kind: "empty" }
  | { scopeId: string; kind: "node"; id: ID }
  | { scopeId: string; kind: "text"; id: ID; offset: number }
```

`PressHit` is latched on mousedown. It determines the gesture kind and which provider/pane owns the gesture. Richer than a bare ID — distinguishes empty space, node body, and text content.

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

  GESTURE LATCHES (set on mousedown, cleared on mouseup/cancel)
  ──────────────
  pressOrigin ── (x, y) for drag threshold
  pressHit    ── what was hit on mousedown (determines gesture kind + scope)
```

The provider receives the visible nodes in order. This is how the gesture layer knows the view's ordering — no separate `SelectionSpace` abstraction.

```ts
// Global inputs (silvery runtime)
const pointer   = signal<{ x: number; y: number; buttons: number }>()
const modifiers = signal<{ shift: boolean; cmd: boolean; opt: boolean }>()

// Gesture latches (set on mousedown, cleared on mouseup/cancel)
const pressOrigin = signal<{ x: number; y: number } | undefined>()
const pressHit    = signal<PressHit | undefined>()

// Global derived
const mouseState  = computed(() => !ptr.buttons ? "idle" : distance < threshold ? "pressed" : "dragging")
const hoverTarget = computed(() => nodeAt(pointer.value))
const dropEffect  = computed(() => mod.opt ? "copy" : mod.cmd ? "link" : "move")

// Per-scope state
const selected = signal<Selection | undefined>()

// Per-scope derived
const selectingKind = computed(() => /* from pressHit + modifiers + mouseState */)
const selecting     = computed(() => /* preview from kind + pointer + selected + nodes */)
const selection     = computed(() => selecting.value ?? selected.value)
```

Note: `selectingKind` derives from **latched `pressHit`** (not live `hoverTarget`). The gesture kind is determined when the mousedown occurs and doesn't change based on where the pointer currently hovers. `selected` is the baseline for all gesture previews — it's frozen during gestures and only updates on commit.

### Selecting kinds

Derived from `(pressHit, modifiers, mouseState)`:

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

Immediate kinds write to `selected` directly. Preview kinds produce `selecting` — committed on explicit trigger, cancelled by Escape.

### Commit and cancel

Gestures end for specific reasons — not just because `selecting` became undefined:

| Trigger | Effect |
|---|---|
| mouseup (during area/text-drag) | commit `selecting` → `selected` |
| shift release (during extend) | commit `selecting` → `selected` |
| drop (during drag) | commit drop operation |
| Escape | **cancel** — discard `selecting`, `selected` unchanged |
| blur / nodes change | cancel (preserve `selected`, discard gesture) |

```ts
// Commit: explicit trigger writes selecting → selected
function commitGesture() {
  if (selecting.value) selected.value = selecting.value
  clearGestureLatches()
}

// Cancel: discard gesture, keep selected unchanged
function cancelGesture() {
  clearGestureLatches()
  // selecting recomputes to undefined → selection falls back to selected
}
```

**Event ordering**: commit reads the gesture snapshot BEFORE clearing buttons/modifiers/latches. Otherwise mouseup could erase `selecting` before the commit captures it. Sequence: snapshot selecting → write to selected → clear latches → update pointer state.

**Preselect on drag**: when dragging an unselected node or text in another node, the preselect (moving cursor to that node) happens on mousedown, not on drag threshold crossing. This sets the frozen baseline before the drag gesture begins.

### Gesture morphing

During drag, the kind recomputes continuously from pointer position. Text-drag crossing a node boundary becomes node-area. Drag back reverts. The kind is derived from the current pointer position relative to `pressHit`, not re-derived from scratch.

## Mouse

### Target → gesture

Target below refers to **pressHit** (latched on mousedown):

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

Shift+drag from empty space is not defined — falls back to `node-area` (shift ignored for area select).

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

Keyboard gestures are event-driven (reducer logic), not pure signal derivation — each keypress produces an immediate mutation or starts/extends a preview.

## Selection.*

Read helpers and constructors on `Selection` values. Pure, no ordering dependency. Consumers can also read `sel.nodes` / `sel.text` directly.

```ts
const Selection = {
  // Read
  cursor(sel):       ID | undefined
  anchor(sel):       ID | undefined
  ids(sel):          ReadonlySet<ID>
  includes(sel, id): boolean                      // O(1)
  isEditing(sel):    boolean
  inputMode(sel):    "board" | "node" | "text"

  // Construct
  from(nodes, text?):  Selection                  // validates invariants
  clear():             undefined

  // Plugin
  with(store, nodes):  SelectionStore
}
```

Selection.* is deliberately small — reads + constructors. Mutation logic (toggle, extend, areaSelect, etc.) lives in the gesture layer, which needs visible node order anyway. This keeps the value model pure and the gesture logic honest about its dependencies.

### Selecting.*

Selection transitions — computes the next Selection from the current one + inputs. Takes `visibleNodes` explicitly because these operations need ordering context. Separate from `Selection.*` because `Selecting.*` transitions state, `Selection.*` reads it.

```ts
const Selecting = {
  // Node-level (clear text)
  select(id):                                          Selection
  toggle(sel, id):                                     Selection | undefined
  extend(sel, target, visibleNodes):                   Selection
  areaSelect(sel, hitIds, mode, visibleNodes):          Selection | undefined
  collapse(sel):                                       Selection
  remove(sel, id):                                     Selection | undefined

  // Text-level (don't touch nodes)
  edit(sel, offset):                                   Selection
  stopEditing(sel):                                    Selection
  moveTextCursor(sel, offset):                         Selection
  extendTextRange(sel, offset):                        Selection
}
```

`areaSelect` receives already-filtered `hitIds` — the caller (gesture layer / provider) decides which nodes in the lasso rectangle are eligible before passing them. This keeps domain concerns (cards vs blocks) out of the selection algebra. km filters by node role in its gesture layer (e.g., Opt+drag passes only card IDs, skipping inline blocks).

### Cursor/anchor rules

| Gesture | Cursor becomes | Anchor becomes |
|---|---|---|
| `select(id)` | `id` | `id` |
| `toggle` — adding | new `id` | preserved |
| `toggle` — removing non-cursor | preserved | preserved (or cursor if anchor removed) |
| `toggle` — removing cursor | first remaining | reset to new cursor |
| `areaSelect(_, ids, "replace")` | `ids[0]` | `ids.at(-1)` |
| `areaSelect(_, ids, "xor")` | preserved if still selected, else first remaining | preserved if still selected, else last remaining |
| `extend(sel, target, nodes)` | `target` | preserved (extend origin) |
| `collapse(sel)` | preserved | cursor |
| `remove` — removing cursor | first remaining | reset to new cursor if anchor removed |

`areaSelect` expects `hitIds` in `visibleNodes` order — the caller normalizes hit-test results before passing them. For `areaSelect` and `extend`, the middle elements follow visible order. For `toggle`, new IDs are prepended (becoming cursor) and middle order is not re-sorted.

Invariants (violations throw): `nodes.length > 0`, no duplicate IDs in `nodes`, `text[0].nodeId === nodes[0]`, `text[1]?.nodeId === nodes[0]`, node transitions clear `text`.

## Provider

The provider receives the visible nodes in order. This is how gestures derive range walks and cursor repair — the view already knows the order.

```tsx
<SelectionProvider nodes={visibleNodeIds}>
  <BoardView />
</SelectionProvider>
```

The `nodes` prop is how the provider knows the view's ordering. No separate `SelectionSpace` interface. When the view changes (collapse, filter, sort), `nodes` updates → gesture derivations recompute.

### Nodes-change reconciliation

When `nodes` changes (collapse, filter, sort, delete), the provider reconciles `selected`:

1. Remove any selected IDs no longer in `nodes` (prune invisible)
2. If cursor was pruned, repair to nearest remaining selected node (or first in `nodes`)
3. If anchor was pruned, reset anchor to cursor
4. If all selected nodes pruned, `selected` becomes `undefined` (board mode)
5. If `nodes` reordered with same IDs, re-normalize middle element order to match new visible order
6. If a gesture is active (`selecting`), cancel it — stale gesture state is dangerous

| Signal | Scope | Why |
|---|---|---|
| pointer, modifiers, mouseState | global | one mouse, one keyboard |
| pressOrigin, pressHit | global | one pointer, one gesture |
| hoverTarget, hoverEffect, dropTarget, dropEffect | global | one pointer, one drag |
| selected, selecting, selection | per provider | each pane owns its selection |
| nodes (visible order) | per provider | each pane has its own ordering |

### km extensions

```ts
import { Selection as Base, Selecting as BaseSelecting } from "@silvery/selection"
export const Selection = { ...Base, expandWithDescendants, insertionPoint }
export const Selecting = { ...BaseSelecting }
```

km's gesture layer filters hitIds before calling `Selecting.areaSelect` — e.g., Opt+drag passes only card IDs (filtering by `node.role === "card"`).

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

### Visual lasso

During `node-area` / `node-area-toggle` gestures, render a lasso rectangle via ANSI styling overlay (inverse video + dim background on cells within the drag rectangle). Uses the same mechanism as silvery's existing `renderSelectionOverlay()`. Works in all terminals.

### Future

Canvas (same type, no range), drill-in (scope push), GridSelection, multiple cursors, collaborative presence.
