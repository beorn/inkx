# Selection

> **silvery.dev guide** for `@silvery/selection` -- a pure-function selection state machine with reactive projections. Draft; internal until promoted to `vendor/silvery/docs/guide/`.

_Status: v1 draft (2026-04-03). Based on [ui/selection.md](../../../../../docs/design/ui/selection.md) (internal spec) and [selection-landscape.md](../../../../../docs/design/selection-landscape.md) (industry analysis). Source: `packages/silvery-selection/src/`._

---

## Overview

`@silvery/selection` manages selection state for silvery apps. It gives you:

- **Node selection** -- cursor, anchor, multi-select with `OrderedSet<ID>`
- **Sub-selection** -- text caret/range, path points, crop region (one at a time)
- **Pointer state machine** -- click vs drag resolution, area-select, text-drag, morphing between modes
- **Drag lifecycle** -- snapshot/preview/commit/cancel with full state revert
- **Root scoping** -- constrain selection to a subtree (group drill-in)
- **Reconciliation** -- repair selection when the tree changes
- **Pure transitions** -- every operation is `(state, args) -> newState`, testable without a store

Two architectural layers handle distinct concerns:

```
events -> pure state machine -> state atom -> signals -> consumers
           (decisions)          (one source)   (projections)
```

The **state machine** makes decisions -- pure functions, testable, replayable. **Signals** provide reactivity -- computed projections with granular subscriptions, no decisions.

### Dependencies

One dependency: `alien-signals` for reactive signals. The pure transitions (`apply.ts`, `pointer.ts`) have zero dependencies.

---

## Quick Start

### Install

```bash
bun add @silvery/selection
```

### Create the store

The store needs a `SelectionApp` that provides tree structure:

```ts
import { createSelection } from "@silvery/selection"
import type { ID, SelectionApp } from "@silvery/selection"

const app: SelectionApp = {
  tree: {
    walkOrder(root) {
      // Return node IDs in depth-first tree-walk order
      // root = null means top level; root = ID means subtree
      return getAllVisibleNodeIds(root)
    },
    parent(id) {
      // Return the parent of a node, or undefined for root nodes
      return getParentId(id)
    },
    children(id) {
      // Return the children of a node
      return getChildIds(id)
    },
  },
}

const sel = createSelection(app)
```

### Select nodes

```ts
// Select a single node
sel.node.select(["card-1" as ID])

// Read selection state (reactive signals)
sel.kind() // "node"
sel.node.cursor() // "card-1"
sel.node.ids() // OrderedSet ["card-1"] with .has()
sel.node.ids().has("card-1" as ID) // true (O(1))

// Multi-select with toggle (Cmd+click)
sel.node.select(["card-2" as ID], true) // toggle = true -> XOR
sel.node.ids() // OrderedSet ["card-1", "card-2"]

// Extend range (Shift+click) -- fills anchor-to-cursor
sel.node.extend("card-3" as ID)

// Collapse multi to cursor
sel.node.collapse()

// Remove one node from selection
sel.node.remove("card-2" as ID)

// Deselect everything
sel.deselect()
```

### Enter text mode

```ts
// Enter text editing on a node (places caret at offset 5)
sel.text.edit("para-1" as ID, 5)

sel.kind() // "text"
sel.text() // { kind: "text", nodeId: "para-1", cursor: 5 }

// Move caret
sel.text.select(10)

// Select a range (cursor=10, anchor=5)
sel.text.select(10, 5)

// Exit text mode (back to node selection)
sel.text.deselect()
sel.kind() // "node" (node selection preserved)
```

### React to changes

Computed signals recompute only when their dependencies change:

```ts
import { effect } from "alien-signals"

// Re-runs only when the cursor moves
effect(() => {
  const cursor = sel.node.cursor()
  if (cursor) highlightCard(cursor)
})

// Re-runs only when selection kind changes
effect(() => {
  const kind = sel.kind()
  updateModeIndicator(kind) // "idle" | "node" | "text" | ...
})
```

---

## Store API Reference

```ts
const sel = createSelection(app)
```

### `sel.node` -- Node Selection

The primary selection layer. Which nodes are selected.

| Member                            | Type              | Description                                                                                |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------------------ |
| `sel.node.cursor()`               | `ID \| null`      | Computed. The primary selected node. Always in `ids`.                                      |
| `sel.node.anchor()`               | `ID \| null`      | Computed. The extend-range origin. Always in `ids` (or null).                              |
| `sel.node.ids()`                  | `OrderedSet<ID>`  | Computed. All selected IDs in tree-walk order. Has O(1) `.has()`.                          |
| `sel.node.select(ids, toggle?)`   | `void`            | Replace selection, or XOR toggle. IDs normalized to tree-walk order. Clears sub-selection. |
| `sel.node.extend(cursor)`         | `void`            | Range select: anchor stays, cursor moves, fills between. Clears sub-selection.             |
| `sel.node.collapse()`             | `void`            | Multi to single. Keeps cursor, resets anchor to cursor.                                    |
| `sel.node.remove(id)`             | `void`            | Remove one ID. Repairs cursor/anchor if needed.                                            |
| `sel.node.selectableAncestor(id)` | `ID \| undefined` | Walk up tree to outermost node in current walk order. Click sub-item, get the card.        |

**Invariants:**

- `cursor` is always in `ids` (or null when idle)
- `anchor` is always in `ids` (or null)
- Single selection: `cursor === anchor`
- Idle: `cursor === null`, `anchor === null`, `ids` is empty
- Every node operation clears `sel.sub`

#### Cursor/anchor rules

| Operation                                      | Cursor               | Anchor                                   |
| ---------------------------------------------- | -------------------- | ---------------------------------------- |
| `select(ids)` replace                          | `ids[0]`             | `ids.at(-1)`                             |
| `select(ids, true)` toggle add                 | first of newly added | preserved                                |
| `select(ids, true)` toggle remove (non-cursor) | preserved            | preserved (or cursor if anchor gone)     |
| `select(ids, true)` toggle remove (cursor)     | first remaining      | reset to new cursor                      |
| `extend(cursor)`                               | the new cursor       | preserved (range fills anchor to cursor) |
| `collapse()`                                   | preserved            | reset to cursor                          |
| `remove(id)` non-cursor                        | preserved            | preserved (or cursor if anchor gone)     |
| `remove(id)` cursor                            | first remaining      | reset to new cursor                      |

### `sel.text` -- Text Sub-selection

Text editing within the cursor node. A sub-selection -- only active when you enter it.

| Member                              | Type                    | Description                                                          |
| ----------------------------------- | ----------------------- | -------------------------------------------------------------------- |
| `sel.text()`                        | `TextSelection \| null` | Computed. `{ kind: "text", nodeId, cursor, anchor? }` or null.       |
| `sel.text.edit(nodeId, offset)`     | `void`                  | Enter text mode. Ensures the parent selectable node is selected.     |
| `sel.text.select(cursor?, anchor?)` | `void`                  | Move caret (1 arg) or set range (2 args). No-op if not in text mode. |
| `sel.text.deselect()`               | `void`                  | Exit text mode. Node selection preserved.                            |

**Signal pattern:** `sel.text()` returns plain data (no methods, tiny allocation). `sel.text.edit/select/deselect` are stable methods on the function object -- created once at store creation. For fine-grained subscription, derive: `computed(() => sel.text()?.nodeId)`.

### `sel.path` -- Path Sub-selection (stub)

Same accessor pattern as text, for vector path point editing. Methods are no-ops until wired.

| Member                 | Type                    | Description                                              |
| ---------------------- | ----------------------- | -------------------------------------------------------- |
| `sel.path()`           | `PathSelection \| null` | Computed. `{ kind: "path", shapeId, pointIds }` or null. |
| `sel.path.edit(...)`   | `void`                  | Stub -- no-op.                                           |
| `sel.path.select(...)` | `void`                  | Stub -- no-op.                                           |
| `sel.path.deselect()`  | `void`                  | Exit path mode.                                          |

### `sel.crop` -- Crop Sub-selection (stub)

Same accessor pattern, for image/frame crop regions.

| Member                 | Type                    | Description                                           |
| ---------------------- | ----------------------- | ----------------------------------------------------- |
| `sel.crop()`           | `CropSelection \| null` | Computed. `{ kind: "crop", objectId, rect }` or null. |
| `sel.crop.edit(...)`   | `void`                  | Stub -- no-op.                                        |
| `sel.crop.select(...)` | `void`                  | Stub -- no-op.                                        |
| `sel.crop.deselect()`  | `void`                  | Exit crop mode.                                       |

### `sel.sub` -- Raw Sub-selection

The polymorphic slot. Only one sub-selection active at a time.

```ts
sel.sub // read: SubSelection | null (getter, reactive)
sel.sub = value // write: enter a sub-selection (or null to exit)
sel.subComputed // signal function for use in computed() chains
```

`sel.text`, `sel.path`, `sel.crop` are typed views over `sel.sub`. You rarely need the raw slot.

### `sel.drag` -- Drag Lifecycle

For selection drags (area-select, text-drag). **Not** for manipulation drags (translate/resize/rotate) -- those emit a `"manipulation-drag"` effect for the app to handle.

| Member                        | Type                | Description                                             |
| ----------------------------- | ------------------- | ------------------------------------------------------- |
| `sel.drag()`                  | `DragState \| null` | Computed. `{ hit, origin, startState }` or null.        |
| `sel.drag.start(hit, origin)` | `void`              | Snapshot full state, start drag mode.                   |
| `sel.drag.end()`              | `void`              | Commit -- current state becomes the truth, drag clears. |
| `sel.drag.cancel()`           | `void`              | Revert entire state to `startState`.                    |

**Drag previews are baseline-based.** During area-select, each pointer-move recomputes from `drag.startState`, not from the previous preview. This prevents oscillation during Cmd+toggle drag.

During drag, `sel.node.ids` and `sel.text()` always show the effective (preview) state. To see the committed-vs-preview distinction, read `sel.drag()?.startState`.

### `sel.root` -- Root Scoping

Constrain selection to a subtree. Groups, frames, zoom, embeds -- all just a root change.

| Member             | Type         | Description                                           |
| ------------------ | ------------ | ----------------------------------------------------- |
| `sel.root.id()`    | `ID \| null` | Computed. null = top level.                           |
| `sel.root.set(id)` | `void`       | Enter: constrain to this subtree.                     |
| `sel.root.up()`    | `void`       | Exit: pop root to its parent (or null for top level). |

All operations respect the root. `sel.node.select` normalizes IDs against the root's walk order. `selectableAncestor` walks up within the root scope.

### `sel.kind` -- Selection Mode

```ts
sel.kind() // "idle" | "node" | "text" | "path" | "crop"
```

Computed from cursor and sub:

- **idle** -- no cursor (nothing selected)
- **node** -- cursor set, no sub-selection
- **text/path/crop** -- cursor set, active sub-selection of that kind

### `sel.deselect()` -- Clear Everything

Clears node selection and sub-selection. Preserves root.

### `sel.selectAll(parent?)` -- Progressive Expand

Select all children of a parent (or all nodes at root level). Progressive behavior:

1. Sub active, partial -> expand to full (all text in block)
2. Sub active, full -> exit sub, continue node-level
3. Single node or partial siblings -> all siblings
4. All siblings -> ascend to parent's siblings
5. Only-child -> immediate ascend
6. At root -> no-op

### `sel.snapshot()` -- Read Full State

```ts
sel.snapshot() // SelectionSnapshot { cursor, anchor, ids, sub, root }
```

Returns the effective snapshot (committed state, or preview during drag).

### `sel.reconcile()` -- Repair After Tree Changes

Prunes deleted IDs, repairs cursor/anchor, clears sub if its target was removed. Call after the tree mutates.

---

## Types

### Core state

```ts
type ID = string & { readonly __brand: "ID" }

type SelectionSnapshot = {
  cursor: ID | null
  anchor: ID | null
  ids: readonly ID[] // plain array (serializable). OrderedSet is a computed view.
  sub: SubSelection | null
  root: ID | null
}

type SelectionKind = "idle" | "node" | "text" | "path" | "crop"
```

### Sub-selection variants

```ts
type SubSelection = TextSelection | PathSelection | CropSelection

type TextSelection = {
  kind: "text"
  nodeId: ID
  cursor: number
  anchor?: number // absent = caret, present = range
}

type PathSelection = { kind: "path"; shapeId: ID; pointIds: readonly ID[] }
type CropSelection = { kind: "crop"; objectId: ID; rect: Rect }
type Rect = { x: number; y: number; w: number; h: number }
```

### Pointer types

```ts
type PressHit = { kind: "empty" } | { kind: "node"; nodeId: ID } | { kind: "text"; nodeId: ID; offset: number }

type PointerOrigin = { x: number; y: number }

type Modifiers = { shift: boolean; cmd: boolean; opt: boolean }

type PointerState =
  | { phase: "idle" }
  | { phase: "pointing-empty"; hit: PressHit; origin: PointerOrigin }
  | { phase: "pointing-node"; hit: PressHit; origin: PointerOrigin }
  | { phase: "pointing-selection"; hit: PressHit; origin: PointerOrigin }
  | { phase: "pointing-text"; hit: PressHit; origin: PointerOrigin }
  | { phase: "dragging-area"; hit: PressHit; origin: PointerOrigin }
  | { phase: "dragging-text"; hit: PressHit; origin: PointerOrigin }
```

### Effects

```ts
type SelectionEffect =
  | { type: "node.select"; ids: ID[]; toggle?: boolean }
  | { type: "node.extend"; cursor: ID }
  | { type: "node.collapse" }
  | { type: "node.remove"; id: ID }
  | { type: "deselect" }
  | { type: "text.edit"; nodeId: ID; offset: number }
  | { type: "text.select"; cursor?: number; anchor?: number }
  | { type: "sub.clear" }
  | { type: "drag.start"; hit: PressHit; origin: PointerOrigin }
  | { type: "drag.end" }
  | { type: "drag.cancel" }
  | { type: "manipulation-drag"; hit: PressHit; origin: PointerOrigin }
```

### SelectionApp (tree interface)

```ts
type SelectionApp = {
  tree: {
    walkOrder(root: ID | null): readonly ID[]
    parent(id: ID): ID | undefined
    children(id: ID): readonly ID[]
  }
}
```

### OrderedSet

```ts
type OrderedSet<T> = ReadonlyArray<T> & { has(value: T): boolean }
```

Array iteration order + O(1) `.has()`. Created internally by the store from the plain `ids` array in snapshots.

---

## Pointer State Machine

The pointer state machine resolves ambiguous gestures (click vs drag, node vs text, area vs manipulation) into concrete selection effects. It is a pure function:

```ts
import { applyPointerEvent } from "@silvery/selection"
import type { PointerEvent, PointerHelpers, PointerState } from "@silvery/selection"

const helpers: PointerHelpers = {
  hitTest(x, y) {
    // Resolve screen coordinates to a PressHit
    return tree.hitTest(x, y)
  },
  nodesInRect(origin, current) {
    // Return node IDs whose screen rects intersect the drag rectangle
    return tree.nodesInRect(origin, current)
  },
  dragThreshold: 5, // pixels before pointer-down becomes a drag
}

let ptrState: PointerState = { phase: "idle" }

function onPointerDown(hit: PressHit, x: number, y: number, mods: Modifiers) {
  const isSelected = sel.node.ids().has(hit.kind === "node" ? hit.nodeId : ("" as ID))
  const event: PointerEvent = {
    type: "pointerDown",
    hit,
    origin: { x, y },
    modifiers: mods,
    isSelected,
  }
  const [next, effects] = applyPointerEvent(ptrState, event, helpers)
  ptrState = next
  applyEffects(effects)
}
```

### State transitions

```
ptr-idle
  |
  pointer-down -> resolve PressHit from tree
  |
  +- hit-empty ---------> ptr-pointing-empty
  +- hit-node (unsel.) --> ptr-pointing-node
  +- hit-node (selected) > ptr-pointing-selection
  +- hit-text -----------> ptr-pointing-text
```

### Pointing states (before drag threshold)

Each pointing state resolves on pointer-up (click) or pointer-move past threshold (drag):

**ptr-pointing-empty**

- Up: `deselect`
- Drag: `drag.start` -> `ptr-dragging-area`

**ptr-pointing-node** (unselected node)

- Up: `node.select` (plain), `node.select(toggle)` (Cmd), `node.extend` (Shift)
- Drag: `node.select` + `manipulation-drag` effect (app handles)

**ptr-pointing-selection** (already selected node)

- Up: `node.select` (reselect -- collapse multi to this one)
- Drag: `manipulation-drag` effect (selection stays, app handles translate/resize)

**ptr-pointing-text**

- Up: `text.edit` (enter text mode / move caret)
- Drag: `text.edit` + `drag.start` -> `ptr-dragging-text`

### Dragging states (after threshold)

**ptr-dragging-area** -- Lasso / rectangle select

- Move: hit-test current position. If text region -> morph to `ptr-dragging-text`. Otherwise compute `nodesInRect` and emit `node.select` (or toggle with Cmd).
- Up: `drag.end`
- Escape: `drag.cancel` (revert to pre-drag state)

**ptr-dragging-text** -- Text range selection

- Move: hit-test current position. If text -> extend range via `text.select`. If not text -> morph to `ptr-dragging-area`.
- Up: `drag.end`
- Escape: `drag.cancel`

**Morphing:** area and text drag states can transition to each other mid-gesture as the pointer moves between content types. The state machine tracks this explicitly -- no ambiguity.

### Double-click

```ts
// doubleClick on node -> enter text mode at offset 0
// doubleClick on text -> text.edit at offset (word boundary is app-defined)
// doubleClick on empty -> no-op
```

### Modifier effects during gestures

| Modifier | Click         | Drag                                            |
| -------- | ------------- | ----------------------------------------------- |
| (none)   | select / edit | area-select / text-drag                         |
| Cmd      | toggle (XOR)  | area-toggle (XOR)                               |
| Shift    | extend range  | extend preview                                  |
| Opt      | --            | manipulation (copy) -- app-level, not selection |

### Applying effects

The pointer state machine returns `SelectionEffect[]` -- pure data describing what to do. The caller applies them:

```ts
function applyEffects(effects: SelectionEffect[]) {
  for (const eff of effects) {
    switch (eff.type) {
      case "node.select":
        sel.node.select(eff.ids, eff.toggle)
        break
      case "node.extend":
        sel.node.extend(eff.cursor)
        break
      case "deselect":
        sel.deselect()
        break
      case "text.edit":
        sel.text.edit(eff.nodeId, eff.offset)
        break
      case "text.select":
        sel.text.select(eff.cursor, eff.anchor)
        break
      case "sub.clear":
        sel.sub = null
        break
      case "drag.start":
        sel.drag.start(eff.hit, eff.origin)
        break
      case "drag.end":
        sel.drag.end()
        break
      case "drag.cancel":
        sel.drag.cancel()
        break
      case "manipulation-drag":
        onManipulationDrag(eff.hit, eff.origin) // app-level handler
        break
    }
  }
}
```

---

## Keyboard Handling

Selection provides the state machine; keyboard bindings are app-level. The mode ladder gives you the pattern:

```
text --Esc--> node --Esc--> idle --click/j--> node --Enter--> text
```

### Standard bindings

| Mode | Key               | Effect                                                                   |
| ---- | ----------------- | ------------------------------------------------------------------------ |
| node | j / k (or arrows) | `sel.node.select([nextId])`                                              |
| node | Shift+j/k         | `sel.node.extend(nextId)`                                                |
| node | Enter             | `sel.text.edit(nodeId, 0)`                                               |
| node | A                 | `sel.selectAll()`                                                        |
| node | Escape            | `sel.node.collapse()` -> `sel.deselect()`                                |
| text | Arrow keys        | `sel.text.select(newOffset)`                                             |
| text | Shift+Arrow       | `sel.text.select(newOffset, sel.text()?.anchor \|\| sel.text()?.cursor)` |
| text | Escape            | `sel.text.deselect()`                                                    |

### Mode-based dispatch

```ts
function handleKey(key: string, mods: Modifiers) {
  const kind = sel.kind()

  if (kind === "text") {
    // Text mode keys
    if (key === "Escape") return sel.text.deselect()
    if (key === "ArrowRight") return sel.text.select((sel.text()?.cursor ?? 0) + 1)
    // ... more text keys
    return
  }

  if (kind === "node") {
    // Node mode keys
    if (key === "Escape") {
      if (sel.node.ids().length > 1) return sel.node.collapse()
      return sel.deselect()
    }
    if (key === "j") return sel.node.select([getNextNode(sel.node.cursor())])
    if (key === "k") return sel.node.select([getPrevNode(sel.node.cursor())])
    if (key === "Enter") {
      const cursor = sel.node.cursor()
      if (cursor) return sel.text.edit(cursor, 0)
    }
    if (key === "a") return sel.selectAll()
    // ... more node keys
    return
  }

  // Idle: any selection-initiating key enters node mode
  if (key === "j") sel.node.select([getFirstNode()])
}
```

---

## Reconciliation

When the tree changes (nodes added, removed, reordered), call `sel.reconcile()` to repair the selection:

```ts
// After any tree mutation
onTreeChange(() => {
  sel.reconcile()
})
```

### What reconcile does

1. **Cancel drag** if active (caller's responsibility to cancel first)
2. **Remove deleted IDs** from the selection, maintaining tree-walk order
3. **Repair cursor** -- if cursor was removed, find nearest remaining in tree-walk order
4. **Repair anchor** -- if anchor was removed, reset to cursor
5. **Deselect** if all selected nodes were removed
6. **Clear sub** if the edited block was deleted

### Target architecture (SlateJS pattern)

The current approach triggers reconciliation as an effect after tree changes. The target architecture eliminates this gap by transforming selection inline with every tree operation:

```ts
function applyTreeOp(state: AppState, op: TreeOp): AppState {
  const nextTree = applyToTree(state.tree, op)
  const nextSelection = transformSelection(state.selection, op, state.tree, nextTree)
  return { ...state, tree: nextTree, selection: nextSelection }
}
```

One transaction, atomic. Undo reverses both tree and selection together. No reconciliation effect, no stale state window.

---

## Pure Transitions

Every store method delegates to a pure transition function. You can call these directly in tests without creating a store:

```ts
import {
  applySelect,
  applyExtend,
  applyCollapse,
  applyDeselect,
  applyRemove,
  applyTextEdit,
  applyTextSelect,
  applyExitSub,
  applyReconcile,
  applySelectAll,
  applySetRoot,
  applyRootUp,
  EMPTY_STATE,
} from "@silvery/selection"
```

### Signatures

```ts
applySelect(state, ids, nodeOrder, toggle?) -> SelectionSnapshot
applyExtend(state, cursor, nodeOrder)       -> SelectionSnapshot
applyCollapse(state)                        -> SelectionSnapshot
applyDeselect(state?)                       -> SelectionSnapshot
applyRemove(state, id, nodeOrder?)          -> SelectionSnapshot
applyTextEdit(state, nodeId, offset)        -> SelectionSnapshot
applyTextSelect(state, cursor?, anchor?)    -> SelectionSnapshot
applyExitSub(state)                         -> SelectionSnapshot
applyReconcile(state, validIds, nodeOrder)  -> SelectionSnapshot
applySelectAll(state, parent, children)     -> SelectionSnapshot
applySetRoot(state, id)                     -> SelectionSnapshot
applyRootUp(state, parentOf)               -> SelectionSnapshot
```

### No-op optimization

Every `apply*` function checks if the result equals the input. If nothing changed, it returns the **same reference**. This enables signal equality skip -- the store checks `next === prev` before writing, so no signal notifications fire for no-ops.

### Pointer state machine

```ts
import { applyPointerEvent } from "@silvery/selection"

applyPointerEvent(ptrState, event, helpers) -> [PointerState, SelectionEffect[]]
```

Also pure. Returns the new pointer state and a list of effects to apply.

### Testing pure transitions

```ts
import { describe, expect, it } from "vitest"
import { applySelect, applyExtend, EMPTY_STATE } from "@silvery/selection"
import type { ID } from "@silvery/selection"

const id = (s: string) => s as ID
const A = id("A"),
  B = id("B"),
  C = id("C")
const ORDER = [A, B, C]

describe("applySelect", () => {
  it("selects a single node", () => {
    const next = applySelect(EMPTY_STATE, [B], ORDER)
    expect(next.cursor).toBe(B)
    expect(next.anchor).toBe(B)
    expect(next.ids).toEqual([B])
  })

  it("normalizes to tree-walk order", () => {
    const next = applySelect(EMPTY_STATE, [C, A], ORDER)
    expect(next.ids).toEqual([A, C]) // tree-walk order, not input order
    expect(next.cursor).toBe(A) // first in normalized
    expect(next.anchor).toBe(C) // last in normalized
  })

  it("returns same ref on no-op", () => {
    const state = applySelect(EMPTY_STATE, [B], ORDER)
    const again = applySelect(state, [B], ORDER)
    expect(again).toBe(state) // same reference -- no signal notification
  })
})

describe("applyExtend", () => {
  it("fills range from anchor to cursor", () => {
    const state = applySelect(EMPTY_STATE, [A], ORDER)
    const next = applyExtend(state, C, ORDER)
    expect(next.ids).toEqual([A, B, C])
    expect(next.anchor).toBe(A) // anchor preserved
    expect(next.cursor).toBe(C) // cursor moved
  })
})
```

### Testing the pointer state machine

```ts
import { applyPointerEvent } from "@silvery/selection"
import type { PointerState, PointerHelpers, PressHit } from "@silvery/selection"

const helpers: PointerHelpers = {
  hitTest: () => ({ kind: "empty" }),
  nodesInRect: () => [],
  dragThreshold: 5,
}

const IDLE: PointerState = { phase: "idle" }

it("click on unselected node emits node.select", () => {
  const hit: PressHit = { kind: "node", nodeId: id("A") }

  // pointer-down
  const [pointing] = applyPointerEvent(
    IDLE,
    {
      type: "pointerDown",
      hit,
      origin: { x: 10, y: 10 },
      modifiers: { shift: false, cmd: false, opt: false },
      isSelected: false,
    },
    helpers,
  )

  expect(pointing.phase).toBe("pointing-node")

  // pointer-up (click)
  const [idle, effects] = applyPointerEvent(
    pointing,
    {
      type: "pointerUp",
      modifiers: { shift: false, cmd: false, opt: false },
    },
    helpers,
  )

  expect(idle.phase).toBe("idle")
  expect(effects).toEqual([{ type: "node.select", ids: [id("A")] }])
})
```

---

## Interaction Rules

All side-effect rules in one place:

| State change                              | Side effects                                        |
| ----------------------------------------- | --------------------------------------------------- |
| Node op (`sel.node.*`)                    | Clears `sel.sub`                                    |
| Root change (`sel.root.*`)                | Cancel drag first, then reconcile                   |
| Tree change (ag tree mutated)             | Cancel drag first, then reconcile                   |
| `sel.sub = ...` (low-level)               | Node state unchanged                                |
| `sel.text.edit()` (typed helper)          | Ensures cursor node is selected -- may update nodes |
| `sel.drag` active                         | Operations write to preview                         |
| `sel.drag.cancel()`                       | Reverts entire state to `startState`                |
| `sel.text.select()` when not in text mode | No-op                                               |
| `sel.path.select()` when not in path mode | No-op                                               |
| Same result as current state              | No write, no signal notifications                   |

---

## km Integration Example

km uses `@silvery/selection` for its board TUI. The store provides all selection state; km adds board-specific helpers as plain app code:

```ts
import { createSelection } from "@silvery/selection"
import { computed } from "alien-signals"

// Create the store, wired to the ag node tree
const sel = createSelection(app)

// Board-specific computed views (not extensions -- just app code)
const cursorCardId = computed(() => {
  const cursor = sel.node.cursor()
  return cursor ? deriveCardAncestor(cursor, viewIndex) : null
})

const cursorColumnId = computed(() => {
  const cursor = sel.node.cursor()
  return cursor ? deriveColumnAncestor(cursor, viewIndex) : null
})

// Board-specific operations (plain functions, not store methods)
function extendHorizontal(direction: "left" | "right") {
  const cursor = sel.node.cursor()
  if (!cursor) return
  const columnIds = getColumnRangeIds(cursor, direction)
  sel.node.select(columnIds)
}

// Keyboard handler checks sel.kind for mode-based dispatch
function handleBoardKey(key: string) {
  if (sel.kind() === "text") {
    // Delegate to text editing subsystem
    return handleTextKey(key)
  }

  // Node mode: vim-style navigation
  switch (key) {
    case "j":
      sel.node.select([getNextSibling(sel.node.cursor())])
      break
    case "k":
      sel.node.select([getPrevSibling(sel.node.cursor())])
      break
    case "h":
      sel.node.select([getParentCard(sel.node.cursor())])
      break
    case "l":
      sel.node.select([getFirstChild(sel.node.cursor())])
      break
    case "Enter": {
      const c = sel.node.cursor()
      if (c) sel.text.edit(c, 0)
      break
    }
    case "Escape": {
      if (sel.node.ids().length > 1) sel.node.collapse()
      else sel.deselect()
      break
    }
  }
}
```

### Migration from scattered state

| Before (km legacy)                             | After (`@silvery/selection`)             |
| ---------------------------------------------- | ---------------------------------------- |
| `cursorNodeId` (Zustand)                       | `sel.node.cursor()`                      |
| `multiSelected` (Zustand)                      | `sel.node.ids()`                         |
| `selectionAnchor` (Zustand)                    | `sel.node.anchor()`                      |
| `inlineEditBlock` (Zustand)                    | `sel.text()`                             |
| `selectAllLevel` (Zustand)                     | not needed -- derived from current state |
| `CursorStore` (pub/sub)                        | deleted -- subsumed                      |
| 5 state fields across 6 files                  | one `sel` object, one state atom         |
| 3 reactive systems (Zustand, pub/sub, signals) | alien-signals only                       |

---

## Architecture Notes

### Why pure state machine + signals

Decisions and reactivity are separate concerns:

- **State machine** (pure functions): "on click, what changes?" Testable in isolation. Replayable. Debuggable with logged transitions.
- **Signals** (computed projections): "is this node selected?" Granular subscriptions. No decisions.

**Rule of thumb:** if it has an `if` making a decision, it belongs in the state machine. If it projects existing state for a consumer, it belongs in a signal.

### Per-node interactive signals

The selection store writes `node.selected` directly on ag nodes. Rendering reads the signal -- no global set checks. Maximum granularity: selecting a different node writes exactly 2 signals (old node `false`, new node `true`).

Planned extension to all interactive state:

```ts
agNode.selected // written by selection store
agNode.hovered // written by pointer system
agNode.armed // written by pointer system (pointer-down, :active)
agNode.focused // written by focus manager
agNode.dropTarget // written by drag system
```

### Framework independence

The pure transitions (`apply.ts`, `pointer.ts`) are framework-agnostic. The store uses alien-signals, but the architecture works with any reactive primitive (Zustand, Jotai, React's `useSyncExternalStore`). The silvery-specific part is reading the ag tree for ordering/hierarchy -- in React DOM, you would pass an ordered ID list explicitly.
