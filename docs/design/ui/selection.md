# View — Selection

Selection type, 9 selecting kinds (gestures), cursor/anchor mechanics, and the selecting/selected signal machinery. For navigation (cursor movement, zoom), see [navigation.md](navigation.md).

---

# Selection Model

`@silvery/selection` — a reactive selection store for silvery apps. Reads the ag node tree for structure. Built on alien-signals.

One integrated system. km adds board-specific behavior as app code, not extensions. For the full industry landscape and future extensibility notes, see [selection-landscape.md](selection-landscape.md).

## Why

km's current selection is scattered across 6 files with 5 different state fields (`cursorNodeId`, `multiSelected`, `selectionAnchor`, `inlineEditBlock`, `selectAllLevel`). Three reactive systems coexist (Zustand, CursorStore pub/sub, alien-signals). No formal gesture lifecycle — area-select and drag-drop are impossible to add cleanly.

Decker's selection system (decker-cardboard) ships the right concepts — `selectedIds`/`selectingIds` split, `DragMode` enum, area-select with modifier support — but the implementation has three specific problems:

1. **State in three places**: DOM attributes (`data-selected`, `data-dragmode`), Zustand store (`selectedIds`, `dragMode`), and JavaScript closure variables (`let anchor`, `let focus` in areaselect.ts). Each can be stale relative to the others.
2. **Browser-inconsistent drag events**: HTML5 `dragstart`/`dragover`/`drop`/`dragend` fire in different orders across Chrome, Firefox, Safari. The imperative handlers depend on event ordering that isn't guaranteed.
3. **DOM as mutable state**: The DOM is both rendering output AND state storage. Browser fires events in unexpected order → DOM state is stale → handler reads inconsistent state → bug.

When something breaks, you're reconstructing what happened across three state sources with browser-dependent event ordering. Untestable.

This design fixes all of it:

- **One state atom** — not three places. No DOM state, no closure variables. All state in one serializable object.
- **Pure state machine** — `(state, event) → [newState, effects]`. Event ordering doesn't matter — the machine processes events one at a time. Same result regardless of browser.
- **No HTML5 drag API** — silvery uses low-level pointer events (down/move/up). No browser-inconsistent `dragstart`/`dragover`/`drop`. The state machine implements drag from pointer primitives. (For React DOM: use `pointerdown`/`pointermove`/`pointerup` instead of HTML5 drag — this is what tldraw does.)
- **Every transition logged** — replay the exact event sequence that caused a bug. Test in isolation.

### Alignment with tldraw

tldraw is the gold standard for canvas selection. Our architecture aligns on the key structural choices — see [selection-landscape.md](selection-landscape.md) for the full comparison.

**Same:** selection as ID array in reactive store, edit mode as separate state, group drill-in via focus/root ID, pointing states before drag threshold, signals for reactivity + state machine for decisions.

**Our improvements:** pure function state machine (testable, replayable — tldraw's StateNode classes have side effects), cursor/anchor for tree UIs (tldraw is set-only — no linear order in canvas), per-node signals (tldraw uses global overlay).

### Per-node interactive signals

The selection store writes `node.selected` directly on ag nodes (bead: km-silvery.1). Planned extension — not just selection but all interactive state as per-node signals:

```ts
agNode.hovered       // pointer over this node (written by pointer system)
agNode.armed         // pointer-down, will receive click (:active — written by pointer system)
agNode.selected      // in selection (written by selection store)
agNode.focused       // has keyboard focus (written by focus manager)
agNode.dropTarget    // drag hovering over (written by drag system)
```

Selection rolls this out first: `sel.node.select([id])` diffs old vs new, writes `node.selected = true/false` on only the changed nodes (2 writes for a cursor move). Other consumers (rendering, a11y, default theme) read the signal. No global set checks. Maximum granularity. silvery can auto-apply default interactive styling (hover highlight, focus ring, selection border) without app code.

### Learnings from tldraw

1. **Enumerate all pointing states explicitly.** tldraw has 7 distinct pointing states (`pointing_canvas`, `pointing_shape`, `pointing_selection`, `pointing_resize_handle`, `pointing_rotate_handle`, `pointing_handle`, `pointing_arrow_label`). Our pointer state machine should list each as a named state in the pure transition function, not just a table.

2. **`getOutermostSelectableShape(hit, root)`** — when clicking a node inside a group/card, walk up to find the outermost container to select (respecting `sel.root`). km already does this for cards: clicking a sub-item selects the card. Silvery should provide this as a core function: `getSelectableAncestor(nodeId, root)` — returns the outermost selectable node within the current root scope.

3. **Batch pointer-move events + skip no-ops.** tldraw batches move events to next tick, flushes everything else immediately. Adopt for performance. Additionally: every apply function must check if the result actually changed before writing. `applySelect` with the same IDs → no write, no signal notification. `applyPointerEvent` during area-drag → compare hit set before/after, skip if identical. Text drag → skip if offset unchanged. This prevents re-renders on every pointer-move when the selection hasn't actually changed.

4. **Per-node signals is our TUI divergence.** tldraw renders selection as a global overlay (blue bounds drawn on top). Works for canvas where indicators are uniform. For TUI, components render their own selected state (border color, background). Per-node signals fit TUI; overlay fits canvas.

5. **Complex sub-selections need sub-state machines.** tldraw's crop has 5 nested states. Our `sel.crop.select(rect)` stub is too simple for real crop interaction. When building crop, it'll need its own pointer states within the main state machine.

6. **Tool-specific transient highlights.** tldraw has `hintingShapeIds` and `erasingShapeIds` — separate from selection. If we add eraser or tool-hint features, add per-node signals: `node.hinting`, `node.erasing`.

7. **Pure state machine is our main improvement over tldraw.** Their `StateNode` classes call `editor.setSelectedShapes()` directly — not testable without a full Editor. Our `(state, event) → [state, effects]` enables replay, logging, and unit testing. This is the key architectural win.

### Could this work in React DOM?

Yes — the architecture is not silvery-specific. The three layers (pure state machine → state atom → reactive projections) work in any React app:

- **Pure state machine**: framework-agnostic — same `(state, event) → [state, effects]` works anywhere
- **State atom**: Zustand, Jotai, or alien-signals — any reactive primitive
- **Reactive projections**: React hooks (`useSyncExternalStore`, `useSelector`) or signals
- **Per-node signals**: map to data attributes (`data-selected="true"`) or per-component `useSelector` calls
- **Hit testing**: `document.elementsFromPoint(x, y)` (what Decker uses) instead of ag tree `hitTest`
- **Pointer events**: same DOM events, same state machine, different hit testing backend

The silvery-specific part is reading the ag tree for ordering/hierarchy. In React DOM, you'd pass an ordered ID list explicitly (like we originally had with `nodes: readonly ID[]`). The state machine and selection operations are identical.

## Two layers

**Node selection** (Layer 1) — which nodes are selected. Always present.

**Sub-selection** (Layer 2) — editing within the cursor node. Optional. Text caret, path points, crop region — polymorphic via `sel.sub`. Cleared by any node operation.

Mode: no cursor = idle, cursor without sub = node, cursor with sub = sub kind (text, path, crop, ...).

## Store API

```ts
type ID = string & { readonly __brand: "ID" }

// OrderedSet<T> = ReadonlyArray<T> with O(1) .has(). Array order + Set lookup.
type OrderedSet<T> = ReadonlyArray<T> & { has(value: T): boolean }

const sel = createSelection(app)
```

### Node selection

```ts
sel.node.cursor                         // Computed<ID | null> — primary selected
sel.node.anchor                         // Computed<ID | null> — extend origin
sel.node.ids                            // Computed<OrderedSet<ID>> — the selection (tree-walk order, O(1) .has())

sel.node.select(ids, toggle?)           // replace, or XOR toggle. IDs normalized to tree-walk order. Cursor/anchor from normalized result.
sel.node.extend(cursor)                 // range: anchor stays, cursor moves, fills between.
sel.node.collapse()                     // multi → single. Keep cursor, reset anchor.
sel.node.remove(id)                     // remove one. Repairs cursor/anchor.
                                        // node.select([]) = deselect (same as sel.deselect)
sel.node.selectableAncestor(id)         // walk up to outermost selectable node within sel.root. Click sub-item → returns the card.
```

`OrderedSet<ID>` = array with O(1) `.has()`. Order follows ag tree walk. Reconciliation maintains order when tree changes.

`cursor` is always in `ids`. `anchor` is always in `ids` (or null). Single selection: cursor = anchor. Idle (board mode): cursor = null, anchor = null, ids = empty.

### Sub-selection

One polymorphic slot. Only one sub-selection active at a time. `sel.sub` is the one writable signal — `sel.text/path/crop` are computed from it.

```ts
sel.sub()                               // read: the active sub-selection (any kind), or null
sel.sub = createTextSelection(...)      // write: enter a sub-selection
sel.sub = null                     // write: exit any sub-selection
```

`sel.text`, `sel.path`, `sel.crop` are typed accessors over `sel.sub`:

```ts
// Text sub-selection [LIVE]
sel.text()                              // { kind: "text"; nodeId: ID; cursor: number; anchor?: number } | null
sel.text.edit(nodeId, offset)           // enter text mode + ensures cursor/ids includes the parent selectable node
sel.text.select(cursor?, anchor?)       // move caret (1 arg) or set range (2 args)
sel.text.deselect()                     // = sel.sub = null

// Path sub-selection [STUB — proves the pattern, not wired in]
sel.path()                              // { kind: "path"; shapeId: ID; pointIds: OrderedSet<ID> } | null
sel.path.edit(shapeId, pointIds?)       // enter path editing
sel.path.select(pointIds, toggle?)      // select points
sel.path.deselect()                     // = sel.sub = null

// Crop sub-selection [STUB — proves the pattern, not wired in]
sel.crop()                              // { kind: "crop"; objectId: ID; rect: Rect } | null
sel.crop.edit(objectId)                 // enter crop mode
sel.crop.select(rect)                   // update crop rect
sel.crop.deselect()                     // = sel.sub = null
```

Each follows the same shape: `edit` to enter, `select` to modify, `deselect` to exit. All sugar over `sel.sub` assignment. Factories are pure data constructors.

> **Simplification note (Pro review 2026-04):** path/crop stubs are premature — only text has a real consumer. Consider replacing `sel.sub` with direct `sel.text` field when a second sub-kind isn't imminent. Keeping stubs for now as design-time proof of extensibility. If/when a second sub-kind arrives, normalize with shared `targetId` field across all sub-selection types.

```ts
createTextSelection(nodeId, offset)     // → { kind: "text", nodeId, cursor: offset }
createPathSelection(shapeId, pointIds?) // → { kind: "path", shapeId, pointIds }
createCropSelection(objectId)           // → { kind: "crop", objectId, rect: default }
```

**Signal pattern:** `sel.text()` returns plain data (no methods, tiny allocation). `sel.text.edit/select/deselect` are stable methods on the function object — created once. For fine-grained subscription, derive: `computed(() => sel.text()?.nodeId)`.

### Drag

Pointer drags that change selection (area-select, text-drag). Not for manipulation (translate/resize/rotate — those are app-level, outside the selection store).

```ts
sel.drag()                              // { startSource, startPosition, startState, rect? } | null
sel.drag.start(hit, origin)             // snapshot full state (nodes + sub), start preview mode
sel.drag.end()                       // preview becomes committed
sel.drag.cancel()                       // revert entire state to startState
```

Any layer can use the drag lifecycle — node-level (lasso), text (text-drag), path (point drag), crop (rect drag). `startState` snapshots the full `SelectionState`, so cancel reverts everything.

During drag, operations update a preview internally. `sel.node.ids` and `sel.text()` always show the effective state. For rendering the committed vs preview distinction, read `sel.drag()?.startState`.

```ts
type PressHit =
  | { kind: "empty" }
  | { kind: "node"; nodeId: ID }
  | { kind: "text"; nodeId: ID; offset: number }
```

`PressHit.text.nodeId` is the editable block node — in km, blocks are nodes at a specific tree depth. No separate `blockId` concept; it's all node IDs.

Immediate interactions (click, j/k) skip the drag — write to committed directly.

### Root

```ts
sel.root.id                             // Computed<ID | null> — null = top level
sel.root.set(id)                        // enter: constrain selection to this subtree
sel.root.up()                           // exit: pop root to its parent in the ag tree (or null)
```

All operations are relative to the root subtree. `root.up()` walks one level up — if root is "card-5", it becomes card-5's parent (or null for top level). Group, frame, zoom, embed are all just a root change.

### Cross-layer

```ts
sel.kind                           // Computed: "idle" | "node" | sel.sub()?.kind
sel.deselect()                          // clear everything (node + sub)
sel.selectAll(layer?)                   // progressive expand, or constrained ("text"/"node")
```

## Interaction rules

All in one place:

| State change | Side effects |
|---|---|
| Node op (`sel.node.*`) | Clears `sel.sub` |
| Root change (`sel.root.*`) | Cancel drag first, then reconcile |
| Tree change (ag tree mutated) | Cancel drag first, then reconcile |
| `sel.sub = ...` (low-level) | Node state unchanged |
| `sel.text.edit()` (typed helper) | Ensures cursor node matches — may update nodes |
| `sel.drag` active | Operations write to preview |
| `sel.drag` cancelled (cleared without `end()`) | Reverts to startState |
| `sel.drag` + `sel.sub` both active | Allowed (text-drag) |
| `sel.text.select()` when not in text mode | No-op |
| `sel.path.select()` when not in path mode | No-op |
| Any operation where result = current state | No write, no signal notifications (skip no-ops) |

## Selection follows tree ops (SlateJS pattern)

**Current implementation**: reconciliation as an effect triggered by ag tree changes. This works but has a gap between tree change and selection fixup.

**Target architecture** (bead: km-silvery.selection.3): eliminate the reconciliation effect. Instead, every tree op transforms selection in the same `apply()` call — one transaction, atomic:

```ts
function applyTreeOp(state: AppState, op: TreeOp): AppState {
  const prevTree = state.tree
  const nextTree = applyToTree(prevTree, op)
  const nextSelection = transformSelection(state.selection, op, prevTree, nextTree)
  return { ...state, tree: nextTree, selection: nextSelection }
}
```

`transformSelection` receives BOTH pre- and post-op trees — needed for "nearest surviving node" repair and identity-preserving moves.

This matches SlateJS's `Editor.apply(op)` which transforms both document and selection through each operation. No reconciliation effect, no watcher, no stale state. Undo reverses both tree + selection atomically.

**Undo**: each history batch stores `selectionBefore` (the selection state at the start of the transaction). Undo restores tree via inverse ops + restores `selectionBefore`. This is the Slate-aligned way to make atomic undo work.

**Sub-selection on move**: if a block is moved but its identity survives, preserve `sel.text` (don't clear sub on pure move). Only clear sub when the block is deleted.

**All tree changes through apply()**: including remote ops, normalization, reset/import. If there are backdoors that skip apply(), the inline transform breaks.

### Reconciliation rules (shared by both approaches)

Whether triggered as an effect (current) or inline in tree ops (target):

1. If drag active → cancel first
2. Remove deleted IDs, maintain order
3. If cursor removed → nearest remaining in tree-walk order
4. If anchor removed → reset to cursor
5. If all removed → deselect
6. If edited block deleted/moved → clear sub

## Progressive select-all

`sel.selectAll()` walks up the ag tree:

1. Sub active, partial → expand to full (e.g., all text in block)
2. Sub active, full → exit sub, continue node-level
3. Single node or partial siblings → all siblings
4. All siblings → ascend to parent's siblings
5. Only-child → immediate ascend
6. At root → no-op

No external state. Derives next expansion from current selection + tree.

## Cursor/anchor rules

| Operation | Cursor | Anchor |
|---|---|---|
| `node.select(ids)` replace | `ids[0]` | `ids.at(-1)` |
| `node.select(ids, true)` toggle add | `ids[0]` | preserved |
| `node.select(ids, true)` toggle remove non-cursor | preserved | preserved (or cursor if anchor gone) |
| `node.select(ids, true)` toggle remove cursor | first remaining | reset to new cursor |
| `node.extend(cursor)` | `cursor` | preserved (range fills anchor↔cursor) |
| `selectAll()` | preserved | cursor |
| `node.collapse()` | preserved | cursor |
| `node.remove(id)` non-cursor | preserved | preserved (or cursor if anchor gone) |
| `node.remove(id)` cursor | first remaining | reset to new cursor |

## Pointer state machine

Pure function: `(ptrState, event, tree) → [newPtrState, SelectionEffect[]]`. The pseudocode below shows effects as method calls for readability — the actual implementation returns effect data, not imperative calls.

All pointing states cancel back to idle on Escape.

```
ptr-idle
  │
  pointer-down → resolve PressHit from ag tree
  │
  ├─ hit-empty ──────────► ptr-pointing-empty
  ├─ hit-node (unselected) ► ptr-pointing-node
  ├─ hit-node (selected) ──► ptr-pointing-selection
  └─ hit-text ─────────────► ptr-pointing-text
```

### Pointing states (before threshold)

```ts
// ptr-pointing-empty
onPointerUp:   sel.deselect()
onDragStart:   sel.drag.start(hit, origin)                    // → ptr-dragging-area

// ptr-pointing-node (unselected)
onPointerUp:   if (cmd) sel.node.select([hit.nodeId], true)   // toggle
               else if (shift) sel.node.extend(hit.nodeId)    // extend
               else sel.node.select([hit.nodeId])             // replace
onDragStart:   sel.node.select([hit.nodeId])                  // preselect
               → emit "manipulation-drag" effect (app handles — NOT sel.drag)

// ptr-pointing-selection (already selected node)
onPointerUp:   sel.node.select([hit.nodeId])                  // reselect (collapse multi to this one)
onDragStart:   → emit "manipulation-drag" effect (app handles — NOT sel.drag)

// ptr-pointing-text
onPointerUp:   sel.text.edit(hit.nodeId, hit.offset)          // enter text / move caret
onDragStart:   sel.text.edit(hit.nodeId, hit.offset)          // start caret
               sel.drag.start(hit, origin)                    // → ptr-dragging-text
```

### Dragging states (after threshold)

```ts
// ptr-dragging-area (started from empty)
onPointerMove(x, y):
  const hit = hitTest(x, y)
  if (hit.kind === "text") {
    sel.text.edit(hit.nodeId, hit.offset)                     // morph → text-drag
  } else {
    if (sel.text()) sel.sub = null                            // morph back → area
    const ids = nodesInRect(sel.drag().startPosition, {x, y})
    if (cmd) sel.node.select(ids, true)                       // toggle
    else sel.node.select(ids)                                 // replace
  }
onPointerUp:   sel.drag.end()
onEscape:      sel.drag.cancel()

// ptr-dragging-text (started from text)
onPointerMove(x, y):
  const hit = hitTest(x, y)
  if (hit.kind === "text") {
    sel.text.select(hit.offset, sel.drag().startState.sub?.cursor)  // extend range
  } else {
    sel.sub = null                                            // morph → area
    sel.node.select(nodesInRect(sel.drag().startPosition, {x, y}))
  }
onPointerUp:   sel.drag.end()
onEscape:      sel.drag.cancel()
```

### Double-click

```ts
onDoubleClick(hit):
  if (hit.kind === "node") sel.text.edit(hit.nodeId, 0)       // select + enter text
  if (hit.kind === "text") selectWord(hit.nodeId, hit.offset)  // select word (app-defined boundaries)
```

### Modifier effects during gestures

| Modifier | During click | During drag |
|---|---|---|
| (none) | select / edit | area-select / drag |
| Cmd | toggle | area-toggle (XOR) |
| Shift | extend | extend preview |
| Opt | — | drag-drop (copy — manipulation, not selection) |

## Keyboard

| Mode | Key | Effect |
|---|---|---|
| node | j / k | `sel.node.select` |
| node | Shift+j/k | `sel.node.extend` |
| node | Enter | `sel.text.edit(nodeId, offset)` |
| node | A | `sel.selectAll()` |
| node | Escape | collapse → deselect |
| text | Arrow | `sel.text.select(newOffset)` |
| text | Shift+Arrow | `sel.text.select(newOffset, sel.text()?.anchor)` |
| text | Escape | `sel.text.deselect()` |

Mode ladder: `text ──Esc──► node ──Esc──► board ──click/j──► node ──Enter──► text`

## Architecture: state machine + signals

Two layers with distinct roles:

**State machine** — where decisions happen. Pure functions: `(state, event) → [newState, effects]`. Testable, replayable, debuggable.

**Signals** — where reactivity happens. Projections of the state atom into forms consumers need. No decisions — just derived views with granular subscriptions.

```
events → pure state machine → state atom → signals → consumers
          (decisions)          (one source)  (projections)
```

### Flow: keyboard j/k (node cursoring)

```
keypress "j"
  → app resolves next node from ag tree
  → applySelect(state, [nextId], tree)         ← pure function
  → new state: { cursor: nextId, ids: {nextId}, sub: null }
  → state atom updated
  → sel.node.cursor recomputes → Card components re-render  ← signal projection
  → sel.node.ids recomputes → selection highlight updates
  → sel.kind recomputes ("node")
```

### Flow: pointer click on node

```
mousedown on card
  → applyPointerEvent(ptrState, down(hit, origin))   ← pure: ptrState → "pointing"
mouseup (no movement)
  → applyPointerEvent(ptrState, up())                 ← pure: ptrState → "idle", emit select effect
  → applySelect(state, [hitNodeId], tree)             ← pure: updates selection
  → state atom updated
  → signals recompute → UI updates
```

### Flow: pointer drag area-select with morphing

```
mousedown on empty
  → applyPointerEvent: ptrState → "pointing-empty"
mousemove past threshold
  → applyPointerEvent: ptrState → "dragging-area", emit drag.start effect
  → store snapshots state (startState)
mousemove (continuous)
  → applyPointerEvent: ptrState stays "dragging-area", emit node.select(hitIds) effect
  → store updates preview → sel.node.ids shows preview
mousemove into text region
  → applyPointerEvent: ptrState → "dragging-text", emit text.edit + sub.clear effects  ← morph
  → signals recompute → UI reflects text-drag mode
mouseup
  → applyPointerEvent: ptrState → "idle", emit drag.end effect
  → store commits preview → signals show committed state
```

### Flow: tree op deletes selected node (SlateJS pattern)

```
user deletes node C (C was selected)
  → applyDeleteNode(state, "C")                       ← pure: one apply for tree + selection
    → tree: remove C
    → selection: transformSelection(sel, deleteOp, tree)
      → remove C from ids, repair cursor to nearest, cancel drag if active
  → state atom updated (tree + selection together)
  → signals recompute → UI reflects both changes atomically
  → undo reverses both: restores C in tree AND in selection
```

### Flow: Escape key (mode ladder)

```
Escape pressed
  → app checks sel.kind:
    "text"  → applyExitSub(state)         ← pure: clears sub, preserves nodes
    "node"  → applyCollapse(state)        ← pure: multi → single (or deselect if single)
    "idle"  → no-op
  → state atom updated
  → sel.kind recomputes → mode ladder advances
  → sel.text() recomputes → text editor unmounts
```

### What goes where

| Concern | Layer | Why |
|---|---|---|
| "On click, what selection changes?" | State machine | Decision logic — testable |
| "Is this node selected?" | Signal (`sel.node.ids.has(id)`) | Reactive projection — granular subscription |
| "Click vs drag threshold" | State machine (pointer) | Discrete transition |
| "What's under the pointer?" | Signal (`hoverHit`) | Continuous derivation |
| "Morphing text↔area during drag" | State machine (pointer) | Explicit transition, debuggable |
| "Which component re-renders?" | Signals | Dependency tracking |
| "Undo snapshot" | State machine output | Plain data from pure function |

### Rule of thumb

If it has an `if` statement making a decision → state machine.
If it's projecting/transforming existing state for a consumer → signal.

### SlateJS alignment

km's tree layer descends from SlateJS. The selection system aligns with the same architecture:

| SlateJS | km / silvery |
|---|---|
| `Editor.apply(op)` | unified `apply()` for tree + selection |
| `Selection.transform(sel, op)` | `transformSelection(sel, treeOp, tree)` |
| `Operation` with `inverse()` | `TreeOp` + `SelectionOp` with inverse |
| Selection = `{ anchor, focus }` | `SelectionSnapshot = { cursor, anchor, ids, sub, root }` |
| `NodeSelection` (whole node) | `sel.node.*` |
| `TextSelection` (range) | `sel.text.*` (sub-selection) |
| Transactions | TEA `apply()` pipeline with `op()` proxy |
| Normalize after mutation | Selection transform in same apply (not a separate pass) |

One apply, one transaction. Tree ops transform selection inline. Undo reverses both. No separate reconciliation system.

## Internal state model

One explicit type for the full store state:

```ts
type SelectionSnapshot = {
  cursor: ID | null
  anchor: ID | null
  ids: readonly ID[]              // stored as plain array (serializable). OrderedSet is a computed view.
  sub: SubSelection | null
  root: ID | null
}

type DragState = {
  startHit: PressHit
  startPosition: { x: number; y: number }
  startState: SelectionSnapshot   // frozen baseline — drag previews compute against THIS, not iteratively
}

type StoreState = {
  committed: SelectionSnapshot    // the truth when not dragging
  drag: DragState | null          // non-null during drag; committed is frozen, preview is derived
  pointer: PointerState           // pointer state machine state
}
```

**Drag previews are baseline-based:** during area-select, each pointer-move recomputes the preview from `drag.startState`, NOT from the previous preview. `previewReplace(startState, rectIds)`, `previewToggle(startState, rectIds)`. This prevents oscillation/flicker during cmd-toggle drag.

`sel.node.ids` (the public API) returns an `OrderedSet` computed view over the effective `ids` array. The stored state is a plain array — serializable for undo/replay.

## Pure transitions + op() proxy

Operations internally use pure functions. Tests call them directly.

```ts
function applySelect(state: SelectionSnapshot, ids: ID[], tree, toggle?): SelectionSnapshot
function applyExtend(state: SelectionSnapshot, cursor: ID, tree): SelectionSnapshot
function applyReconcile(state: SelectionSnapshot, tree): SelectionSnapshot
// ... all apply functions take and return SelectionSnapshot
```

### op() — operations as data, ergonomically

silvery's `op()` proxy (see `hub/silvery/design/v15-tea/app.md`) intercepts method calls and routes them through `apply()` as serializable data. You write normal method calls — same API, same autocomplete — and get logging/undo/replay for free:

```ts
// Direct — fast, no overhead
sel.node.select(["C"])

// Through op() — intercepted by plugins (undo, tracing, logging)
op(sel).node.select(["C"])
// → apply({ type: "model-op", path: ["node", "select"], args: [["C"]], run: ... })
```

No `defineOp()` ceremony. The method name IS the op type. The arguments ARE the op data. The proxy reifies automatically.

**Default usage should be through `op()`** — most selection changes should be undoable. Direct calls (`sel.node.select()` without `op()`) are the exception for performance-critical paths (e.g., pointer-move preview updates during drag where undo granularity is drag-level, not per-pixel).

```ts
// Normal (most code): undoable
op(sel).node.select(["C"])
op(sel).text.edit("para1", 5)

// Exception (drag preview): not individually undoable, drag.end/cancel handles it
sel.node.select(hitIds)  // direct — inside drag, preview only
```

Undo captures `SelectionState` snapshots. `op()` records the path + args for replay. Both are plain data, serializable.

## Content model

The ag tree provides everything: IDs, ordering (tree walk), hierarchy (parent/children), visibility (rendered = selectable), hit testing (scrollRect).

Assumptions:
- Tree hierarchy — nodes have parent/children
- Character-addressed text — integer offsets (unit app-defined)
- Block containment — text blocks are descendants of selectable nodes
- Single-block editing — one block at a time

## km integration

```ts
const sel = createSelection(app)

// Board-specific helpers — just app code, not extensions
function extendHorizontal(sel, direction) {
  const columnIds = getColumnRangeIds(sel.node.cursor, direction)
  sel.node.select(columnIds)
}

const cursorCardId = computed(() => deriveCardAncestor(sel.node.cursor, viewIndex))
const cursorColumnId = computed(() => deriveColumnAncestor(sel.node.cursor, viewIndex))
```

## Migration (km-tui)

| Current | New | Notes |
|---|---|---|
| `cursorNodeId` | `sel.node.cursor` | Computed |
| `multiSelected` | `sel.node.ids` | OrderedSet |
| `selectionAnchor` | `sel.node.anchor` | Computed |
| `inlineEditBlock` | `sel.text()` | TextEdit or null |
| `selectionLevel` | `sel.kind` | Computed |
| `visualMode` / `visualAnchor` | km gesture handler | App code |
| `selectAllLevel` | not needed | Derived |
| `curswantX` / `curswantY` | km sticky cursor helper | App code |
| `CursorStore` | deleted | Subsumed |
| `cursorCardNodeId` | `cursorCardId` computed | km app code |
| Zustand | alien-signals (Phase 9) | One reactive system |


---

# Selection State Spec

Defines the 5 state concepts that govern cursor, selection, editing, focus scoping, and visual treatment in km-tui. Implementation reference for `km-tui.focus` epic and `km-tui.hierarchical-node-state`.

## Core Principle: TEA Owns All Input

**TEA (the centralized command system) dispatches ALL keyboard input.** Components never directly intercept stdin. Focus scopes tell TEA which subtree is active so it can resolve the right commands — they don't capture keys.

```
terminal input → parser → TEA command system
  → resolves command: key + mode + focus context (which scope is active)
  → dispatches to handler (board-actions, dialog, text editor)
  → unhandled keys bubble up through focus scopes → root = global commands
```

- **Commands** are centralized: keybinding registry, introspectable (help, which-key, command palette)
- **Focus scopes** provide context: "this dialog is active" → dialog commands available
- **`when()` predicates** gate commands: `when: inDialogScope` replaces `when: dialogOpen`
- **`onKeyDown` on Box** is a low-level escape hatch, NOT the primary input model

This matches VS Code: commands are centralized, `when` clauses determine availability based on context, components receive actions — they never listen for raw keys.

## The 5 Concepts

These are SEPARATE even when the UX feels unified.

| # | Concept | Source of truth | Nullable? | What it answers |
|---|---------|----------------|-----------|-----------------|
| 1 | **Logical focus (cursor)** | `sel.node.cursor()` | Yes (deselected) | "Which node do commands target?" |
| 2 | **Selection set** | `sel.node.ids()` | Empty set | "Which nodes are batch-operated on?" |
| 3 | **Editing owner** | `sel.text()?.nodeId` | Yes (not editing) | "Which node owns the text cursor?" |
| 4 | **Active scope** | `focusManager.activeScopeId` | Yes (root scope) | "Which pane/container captures keyboard?" |
| 5 | **Muted scope** | Derived (ancestor of cursor/selection) | N/A | "Which subtrees are visually de-emphasized?" |

### Relationships

- **Cursor ⊂ Selection**: cursor is always the first element of the selection set (or null when deselected). Single-select = selection set of one = cursor.
- **Editing implies cursor**: `sel.text()` is non-null only when cursor is on the same node. Editing without cursor is an invariant violation.
- **Active scope is orthogonal**: scope tracks which PANE has keyboard capture (board vs detail). Cursor/selection live within the active scope's pane.
- **Muted scope is derived**: a node is in muted scope when an ancestor is selected/editing. Not stored — computed from cursor + selection + editing via tree walk (or signals).

## The Card as Bridge

A card is a container node at column depth. It bridges node selection and text selection:

| User action | Node selection | Text selection | Card's role |
|---|---|---|---|
| Click card | cursor = cardId | — | Selected container |
| j/k into card's child | cursor = subItemId | — | Breadcrumb parent (yellow border) |
| Enter on card title | cursor = cardId | {nodeId: cardId, offset} | Editing scope (bold focusborder) |
| Enter on sub-item | cursor = subItemId | {nodeId: subItemId, offset} | Editing scope (bold focusborder) |
| Arrow up/down in edit | cursor = adjacentId | {nodeId: adjacentId, offset: 0} | Editing scope unchanged |
| Escape from edit | cursor = nodeId | — (cleared) | Returns to node selection |

The card is the **editing scope**: the `editingDescendant` reduced signal on each node tracks whether any descendant is being edited. The bold focusborder wraps the scope (the card), not the individual node being edited. Analogous to VS Code's editor pane having focus border, not the individual line.

**Dual role**: cards are focusable containers normally (click, j/k to select). Promoted to editing scopes when any descendant enters text mode (captures keyboard, suppresses selection highlights, shows bold focusborder).

## Mode Ladder

Each level is a distinct state. Escape peels one layer up. Enter/click descends.

```
deselected ←Esc── board ←Esc── column ←Esc── card ←Esc── sub-item ←Esc── text-edit
(null)            (rootId)      (colId)       (cardId)    (subItemId)      (sel.text)
   │                 │             │              │            │               │
   j→ first card     h/l→         j/k→           j/k→         Enter→          ArrowUp/Down→
                                                                              (adjacent node,
                                                                               stays in edit)
```

### Transitions

| From | Trigger | To | State change |
|---|---|---|---|
| Deselected | j/k/h/l | Card focused | cursor = first card in first column |
| Deselected | Click card | Card focused | cursor = clicked card |
| Deselected | Click top-bar | Board level | cursor = rootId |
| Board level | j/k | Card focused | cursor = first card |
| Board level | Escape | Deselected | cursor = null |
| Column focused | j/k | Card focused | cursor = first/last card in column |
| Column focused | Escape | Deselected | cursor = null |
| Card focused | Enter/i | Text editing | sel.text.edit(cardId, 0) |
| Card focused | j (outline) | Sub-item focused | cursor = first child |
| Card focused | Escape | Deselected | cursor = null |
| Sub-item focused | Enter/i | Text editing | sel.text.edit(subItemId, 0) |
| Sub-item focused | Escape | Card focused | cursor = parent card |
| Text editing | Escape | Node focused (same node) | sel.text cleared |
| Text editing | ArrowUp/Down | Text editing (adjacent) | cursor + sel.text move together |
| Text editing | Click outside card | Card focused (clicked) | sel.text cleared, cursor = clicked |

## Interaction Matrix

What each element looks like in each state:

| Element | Deselected | Board level | Column focused | Card focused | Sub-item focused | Text editing |
|---|---|---|---|---|---|---|
| **Board bg** | none | $selection-bg tint | none | none | none | none |
| **Column title** | normal | tinted | inverse | normal (or breadcrumb if cursor in col) | breadcrumb yellow | breadcrumb yellow |
| **Card border** | invisible ($surface-bg) | invisible | invisible | $selection-bg yellow | $selection-bg yellow (breadcrumb) | bold $focusborder |
| **Card bg** | none | none | none | selectedBg tint | none | none |
| **Card title** | normal fg | normal fg | normal fg | inverse ($selection-bg/$selection) | normal fg + yellow border | normal fg (no inverse) |
| **Sub-item title** | normal | normal | normal | normal | inverse ($selection-bg/$selection) | normal (no highlights) |
| **Body text** | muted, not bold | muted, not bold | muted, not bold | muted, not bold | muted, not bold | muted, not bold |
| **+N more** | matches border | matches border | matches border | matches border | matches border | matches border |
| **Hover any card** | border → $muted | — | — | — | — | — |

## Node Capabilities

Not every node participates in every state concept. Three capabilities:

| Capability | Meaning | Examples | Determines |
|---|---|---|---|
| **Selectable** | Can receive cursor; can be in selection set | Cards, sub-items, column headers, body blocks | What j/k/click/shift-select can land on |
| **Editable** | Can enter text mode (has content to edit) | Cards with title, sub-items with content, body paragraphs | What Enter/i activates |
| **Scoped** | Creates a keyboard capture boundary when active | Cards in edit mode, detail pane, dialogs | What traps keys and shows focusborder |

### Spatial selection

Navigation (j/k, arrows, mouse click) IS selection — moving the cursor selects the target node. "Spatial selection" means: given a direction, find the nearest SELECTABLE node and select it. Non-selectable nodes (decorative separators, overflow indicators, virtual grouping nodes) are skipped.

Silvery's `focusDirection("up"/"down"/"left"/"right")` provides the spatial lookup. The `focusable` prop on a Box marks it as a valid target. In km, `focusable` = selectable.

### Capability matrix

| Node type | Selectable | Editable | Scoped (when editing) |
|---|---|---|---|
| Board root | Yes (cursor=rootId) | No | No |
| Column header | Yes | Yes | No |
| Card (structural item) | Yes | Yes | Yes (bold focusborder) |
| Sub-item inside card | Yes | Yes | No (card is the scope) |
| Body block (paragraph/li) | Yes | Yes | Yes (same as card) |
| Body card at column top | Yes | Yes | Yes |
| Code block | Yes | Yes (code editing) | No (card is the scope) |
| Table block | Yes | No (read-only) | No |
| HR separator | Yes (navigable) | No | No |
| +N more overflow | No | No | No |
| Virtual __body__ column | Yes (cursor can land) | No | No |
| Virtual __meta__ field | Yes (detail pane) | Yes (some) | No |
| Dialog content | No (own focus system) | — | Yes (modal scope) |

## Command Target Precedence

When a command fires, which node(s) does it act on?

| Command type | Target | Example |
|---|---|---|
| **Cursor movement** (j/k/h/l) | Cursor node → move | cursor_down |
| **Edit entry** (Enter/i) | Cursor node → enter text mode | enter_inline_edit |
| **Batch mutation** (delete, move, cut) | Selection set if >1, else cursor | delete_node |
| **Single mutation** (fold, zoom) | Cursor node only | fold_node, zoom_in |
| **Board-level** (fold all, filter, view mode) | Board root (no cursor needed) | fold_all_more, filter |
| **Text ops** (type, delete char) | Editing owner (sel.text target) | TEXT_INSERT |

## Visible Order vs Structural Order

Two different orderings exist:

| | Structural order | Visible order |
|---|---|---|
| **Source** | Tree DFS (parent → children) | Tree DFS minus collapsed/filtered/hidden nodes |
| **Used by** | Path.compare, ancestor/descendant tests | Range selection, j/k navigation, shift-select |
| **Includes collapsed** | Yes | No |
| **Includes filtered** | Yes | No |
| **Includes virtual (__body__, __meta__)** | No (not in tree) | Yes (in view lens) |

Range selection (shift+j/k) uses visible order. Path.compare uses structural order. These diverge when nodes are collapsed or filtered.

## Selection Representation (current → target)

### Current
```ts
cursor: string | null           // sel.node.cursor()
selectedIds: Set<string>        // sel.node.ids() — includes cursor
editTarget: { nodeId, offset }  // sel.text()
```
Plus derived: cursorCardNodeId, cursorColumnNodeId, cursorDepth — computed in Board.tsx and written directly to NodeStore signals. Editing scope detected via `editingDescendant` reduced signal (per-node, not store-level).

### Target (Phase F of km-tui.focus)
```ts
cursor: { nodeId: string, path: Path } | null
selection: { anchor: { nodeId, path }, focus: { nodeId, path } }
editTarget: { nodeId: string, offset: number } | null
```
Hybrid identity: nodeId for stability across mutations, path for ordering/range math. Remap strategy: after tree mutations, re-derive path from nodeId; if nodeId deleted, clear selection.

## Invariants (impossible combinations)

These should be dev-mode assertions:

- [ ] Editing without cursor: `sel.text() !== null && sel.node.cursor() === null`
- [ ] Editing node ≠ cursor node: `sel.text()?.nodeId !== sel.node.cursor()`
- [ ] Selection anchor without focus (or vice versa)
- [ ] Cursor on node not visible in current view (not in ViewTree)
- [ ] Active scope pointing to non-existent pane
- [ ] Multi-select across panes (each pane has independent selection)
- [ ] editingDescendant true but sel.text() is null (editing signal without active text selection)

## Multi-Select

Any selectable node can be multi-selected — cards, sub-items, body blocks, column headers. The selection set is a flat set of node IDs (not limited to one tree level). Text editing and multi-select are mutually exclusive (entering edit clears multi-select).

| Action | Effect on selection set |
|---|---|
| Click node | Set = {clicked node} |
| Ctrl-click node | Toggle node in set |
| Shift+j/k | Extend set in direction (visible order) |
| j/k (no shift) | Collapse set to cursor |
| Enter (edit) | Clear multi-select, enter edit on cursor |
| Escape | If multi-selected: collapse to cursor. If single: deselect. |

Batch commands (delete, move, cut, task status) operate on the full selection set. Single commands (fold, zoom, edit) operate on cursor only.

## See Also

- `apps/km-tui/src/views/selection-style.ts` — implementation rules (to be rewritten around this spec)
- `km-tui.focus` — epic tracking the unification
- `km-tui.hierarchical-node-state` — signals implementation
- `docs/design/ui/selection.md` — @silvery/selection API design
